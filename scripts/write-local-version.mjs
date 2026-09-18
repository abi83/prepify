import { writeFileSync } from 'fs'

writeFileSync('version.txt', `local-${new Date().toISOString()}`)
