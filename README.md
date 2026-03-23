# Maven Snapshot Validator

A simple web application to check when Maven SNAPSHOT packages were published to the Sonatype Central snapshot repository.

## Features

- Look up any Maven SNAPSHOT artifact by coordinates (groupId, artifactId, version)
- View human-readable publish dates with relative time ("10 days ago")
- See all published artifacts (aar, jar, pom, sources, etc.)
- View dependencies from the POM file with versions and scopes
- Direct links to raw metadata XML files

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

Then open http://localhost:3000 in your browser.

## API

### GET /api/check

Query parameters:
- `groupId` - Maven group ID (e.g., `com.example`)
- `artifactId` - Maven artifact ID (e.g., `my-library`)
- `version` - Version string (e.g., `1.0.0-SNAPSHOT`)

Example:
```
GET /api/check?groupId=com.example&artifactId=my-library&version=1.0.0-SNAPSHOT
```

Response includes:
- Package coordinates and build info
- Last updated timestamp (raw and formatted)
- Available versions
- Published artifacts with timestamps
- Dependencies from POM

## Repository

Uses the Sonatype Central snapshot repository:
```
https://central.sonatype.com/repository/maven-snapshots/
```

## License

MIT
