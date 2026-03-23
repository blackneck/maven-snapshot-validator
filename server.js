const express = require('express');
const xml2js = require('xml2js');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.static('public'));
app.use(express.json());

// Parse Maven timestamp format: YYYYMMDDHHMMSS
function parseTimestamp(ts) {
    if (!ts || ts.length < 14) return null;
    const year = ts.substring(0, 4);
    const month = ts.substring(4, 6);
    const day = ts.substring(6, 8);
    const hour = ts.substring(8, 10);
    const minute = ts.substring(10, 12);
    const second = ts.substring(12, 14);
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
}

// Format date to human readable
function formatDate(date) {
    if (!date) return 'Unknown';
    return date.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
    });
}

// Calculate relative time
function relativeTime(date) {
    if (!date) return '';
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffMinutes > 0) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    return 'just now';
}

app.get('/api/check', async (req, res) => {
    const { groupId, artifactId, version } = req.query;

    if (!groupId || !artifactId || !version) {
        return res.status(400).json({ error: 'Missing required parameters: groupId, artifactId, version' });
    }

    const groupPath = groupId.replace(/\./g, '/');
    const baseUrl = 'https://central.sonatype.com/repository/maven-snapshots';
    const metadataUrl = `${baseUrl}/${groupPath}/${artifactId}/${version}/maven-metadata.xml`;
    const artifactMetadataUrl = `${baseUrl}/${groupPath}/${artifactId}/maven-metadata.xml`;

    try {
        // Fetch version-specific metadata
        const [versionResponse, artifactResponse] = await Promise.all([
            fetch(metadataUrl),
            fetch(artifactMetadataUrl)
        ]);

        if (!versionResponse.ok) {
            return res.status(404).json({ 
                error: `Package not found: ${groupId}:${artifactId}:${version}`,
                url: metadataUrl
            });
        }

        const versionXml = await versionResponse.text();
        const artifactXml = artifactResponse.ok ? await artifactResponse.text() : null;

        const parser = new xml2js.Parser();
        const versionData = await parser.parseStringPromise(versionXml);
        const artifactData = artifactXml ? await parser.parseStringPromise(artifactXml) : null;

        const versioning = versionData.metadata?.versioning?.[0];
        const snapshot = versioning?.snapshot?.[0];
        const snapshotVersions = versioning?.snapshotVersions?.[0]?.snapshotVersion || [];

        const lastUpdatedRaw = versioning?.lastUpdated?.[0];
        const lastUpdatedDate = parseTimestamp(lastUpdatedRaw);

        // Find the POM artifact to get the resolved version
        const pomArtifact = snapshotVersions.find(sv => sv.extension?.[0] === 'pom');
        const pomVersion = pomArtifact?.value?.[0];
        
        // Fetch dependencies from POM if available
        let dependencies = [];
        if (pomVersion) {
            const pomUrl = `${baseUrl}/${groupPath}/${artifactId}/${version}/${artifactId}-${pomVersion}.pom`;
            try {
                const pomResponse = await fetch(pomUrl);
                if (pomResponse.ok) {
                    const pomXml = await pomResponse.text();
                    const pomData = await parser.parseStringPromise(pomXml);
                    const deps = pomData.project?.dependencies?.[0]?.dependency || [];
                    dependencies = deps.map(dep => ({
                        groupId: dep.groupId?.[0],
                        artifactId: dep.artifactId?.[0],
                        version: dep.version?.[0],
                        scope: dep.scope?.[0] || 'compile',
                        optional: dep.optional?.[0] === 'true'
                    }));
                }
            } catch (e) {
                // POM fetch failed, continue without dependencies
            }
        }

        const result = {
            groupId,
            artifactId,
            version,
            urls: {
                versionMetadata: metadataUrl,
                artifactMetadata: artifactMetadataUrl
            },
            snapshot: snapshot ? {
                timestamp: snapshot.timestamp?.[0],
                buildNumber: snapshot.buildNumber?.[0]
            } : null,
            lastUpdated: {
                raw: lastUpdatedRaw,
                formatted: formatDate(lastUpdatedDate),
                relative: relativeTime(lastUpdatedDate)
            },
            availableVersions: artifactData?.metadata?.versioning?.[0]?.versions?.[0]?.version || [],
            latestVersion: artifactData?.metadata?.versioning?.[0]?.latest?.[0],
            artifacts: snapshotVersions.map(sv => ({
                classifier: sv.classifier?.[0] || null,
                extension: sv.extension?.[0],
                value: sv.value?.[0],
                updated: {
                    raw: sv.updated?.[0],
                    formatted: formatDate(parseTimestamp(sv.updated?.[0])),
                    relative: relativeTime(parseTimestamp(sv.updated?.[0]))
                }
            })),
            dependencies
        };

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Maven Snapshot Checker running at http://localhost:${PORT}`);
});
