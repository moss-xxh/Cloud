export interface FileItem {
  path: string
  name: string
  size: number
  extension: string
  modified: string
  mode: number
  isDir: boolean
  isSymlink: boolean
  type: string
  items?: FileItem[]
  numDirs?: number
  numFiles?: number
  sorting?: {
    by: string
    asc: boolean
  }
}

export interface ResourceResponse {
  path: string
  name: string
  size: number
  extension: string
  modified: string
  mode: number
  isDir: boolean
  isSymlink: boolean
  type: string
  items: FileItem[]
  numDirs: number
  numFiles: number
  sorting: {
    by: string
    asc: boolean
  }
}

export interface UsageResponse {
  total: number
  used: number
}
