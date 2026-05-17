# stremio-local-addon

An add-on for stremio meant to be ran on a server which indexes locally found torrent and video files

It does a few things:

* Scans the filesystem for video files (currently `mp4`, `mkv`, `avi` and others - depends on the implementation in `lib/findFiles`) and `torrent` files containing videos
* Tries to recognize video files as entertainment content and associate them with an IMDB ID
* Presents a `catalog` to Stremio containing all the found items, where IMDB-recognized video files are grouped by IMDB ID and torrents are grouped by BitTorrent infohash; non-recognized video files are omitted
* Allows Stremio to open any BitTorrent infoHash using `/meta/bt:<infoHash>` request to this add-on

## Running with Docker Compose

Copy `docker-compose.yml` and adjust the environment variables and volume paths to your setup, then run:

```sh
docker-compose up -d
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PUID` | `1001` | User ID the process runs as (for file permission matching) |
| `PGID` | `1002` | Group ID the process runs as |
| `TZ` | `Europe/Lisbon` | Timezone |
| `NODE_ENV` | `production` | Node environment |
| `PORT` | `1222` | Port the addon listens on inside the container |
| `HOST` | `0.0.0.0` | Host the addon binds to |
| `REINDEX_INTERVAL_MS` | `600000` | How often (ms) the addon rescans for new files |
| `PUBLIC_HOST` | `http://192.168.3.20:1222` | Public URL used in the manifest and install link — set this to your LAN IP/hostname |
| `HOME` | `/media` | Home directory inside the container (used as the scan root) |

### Volumes

| Host path | Container path | Description |
|---|---|---|
| `./localFiles` | `/app/localFiles` | Persistent storage for the addon index |
| `./media` | `/media` (read-only) | Directory tree that will be scanned for video/torrent files |

After the container starts, open `http://<PUBLIC_HOST>/manifest.json` in a browser to verify the addon is running, then install it in Stremio via `http://<PUBLIC_HOST>/manifest.json`.

## Testing

```sh
npm start
npm test
```

## Data structure

The data is kept in an set (dictionary) of entries (`filePath=>entry`). Each entry represents one file on the filesystem.

Each entry is defined by `{ itemId, name, files }`. When the entry represents a `filePath` of no interest (not an indexable video), we just save `{ files: [] }`. Entries may contain other extra properties such as the Bittorrent-specific `ih` and `sources`.

The reason `files` is an array is that one file on the filesystem may contain multiple indexable videos (e.g. a `.torrent` file).

## itemId

`itemId` is the stremio metadata ID this entry corresponds to.

It may be formed in two ways:

`bt:<bittorrent info hash>`

`local:<IMDB ID>`

In other words, to make a single Stremio `MetaItem` object, files are grouped either by the torrent they belong in, or by the IMDB ID they are indexed by. So this add-on will only display videos either indexed by IMDB ID or belonging in a torrent.

## Storage

The persistence layer is defined in `lib/storage`, and it keeps each entry as one line in the storage file. Entries may only be added to the storage file, and no entries may be removed.

It allows referencing entries by file path (`.byFilePath`) or by item ID (`.byItemId`). There may be more than one entry per item ID.

The in-memory structure is as follows

`byFilePath`: `filePath=>entry`

`byItemId`: `itemId=>(filePath=>entry)`

Finally, we have the `storage.getAggrEntry` function, which gives us an aggregate entry for an `itemId`, by taking all entries for the given `itemId` and merging them by concatting `files` and taking the leftmost values of the other properties (`name`, `ih`, `sources`). Taking the leftmost values is OK for torrents since `itemId` implies grouping by torrent anyway (in other words all `ih` and `sources` values will be the same).
