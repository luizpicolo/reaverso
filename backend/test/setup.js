import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(tmpdir(), `reaverso-tests-${process.pid}`)
process.env.USER_KEYS_DIR = join(root, 'keys')
process.env.IPFS_CACHE_DIR = join(root, 'cache')
process.env.STORAGE_DIR = join(root, 'uploads')
process.env.PLEROMA_INSTANCE_URL = 'http://pleroma.test'
process.env.MAX_FILE_SIZE = '1048576'
mkdirSync(root, { recursive: true })
