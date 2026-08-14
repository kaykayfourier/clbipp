import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_FILE_BYTES, buildObjectPath, uploadFile } from './storage'

const mockUpload = vi.fn()

vi.mock('./supabase/client', () => ({
  createClient: vi.fn(() => ({
    storage: { from: vi.fn(() => ({ upload: mockUpload })) },
  })),
}))

beforeEach(() => {
  mockUpload.mockReset()
})

const UID = 'efc87c57-1659-4de1-98af-86c2068b65e2'

/** A File whose reported size we control, without allocating megabytes. */
function fakeFile(name: string, size: number, type = 'image/jpeg'): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('buildObjectPath', () => {
  it('puts the user id first — the segment every storage RLS policy checks', () => {
    const path = buildObjectPath({ userId: UID, filename: 'photo.jpg' })

    expect(path.split('/')[0]).toBe(UID)
  })

  it('keeps the caller segments between the uid and the filename', () => {
    const path = buildObjectPath({
      userId: UID,
      segments: ['PKP-2026-000123', 'item-1'],
      filename: 'photo.jpg',
    })

    const parts = path.split('/')
    expect(parts.slice(0, 3)).toEqual([UID, 'pkp-2026-000123', 'item-1'])
    expect(parts).toHaveLength(4)
  })

  it('strips traversal out of the filename so it cannot escape the user folder', () => {
    const path = buildObjectPath({ userId: UID, filename: '../../etc/passwd' })

    expect(path.split('/')[0]).toBe(UID)
    expect(path.split('/')).toHaveLength(2)
    expect(path).not.toContain('..')
  })

  it('strips traversal out of the caller segments too', () => {
    const path = buildObjectPath({
      userId: UID,
      segments: ['../../../other-user'],
      filename: 'photo.jpg',
    })

    expect(path.split('/')[0]).toBe(UID)
    expect(path).not.toContain('..')
  })

  it('preserves the extension of a dotted filename', () => {
    const path = buildObjectPath({ userId: UID, filename: 'My.Holiday.Photo.JPEG' })

    expect(path).toMatch(/\.jpeg$/)
    expect(path).toContain('my-holiday-photo')
  })

  it('gives two files with the same name distinct paths', () => {
    const a = buildObjectPath({ userId: UID, filename: 'img_0001.jpg' })
    const b = buildObjectPath({ userId: UID, filename: 'img_0001.jpg' })

    expect(a).not.toBe(b)
  })

  it('falls back to a usable name when the filename sanitises to nothing', () => {
    const path = buildObjectPath({ userId: UID, filename: '///' })

    expect(path.split('/')).toHaveLength(2)
    expect(path.split('/')[1]).toMatch(/file$/)
  })
})

describe('uploadFile', () => {
  it('rejects a file over 5 MB before sending anything', async () => {
    const result = await uploadFile({
      bucket: 'pickup-photos',
      userId: UID,
      file: fakeFile('huge.jpg', MAX_FILE_BYTES + 1),
    })

    expect(result.path).toBeNull()
    expect(result.error).toContain('5 MB')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('accepts a file exactly at the limit', async () => {
    mockUpload.mockResolvedValue({ error: null })

    const result = await uploadFile({
      bucket: 'pickup-photos',
      userId: UID,
      file: fakeFile('exact.jpg', MAX_FILE_BYTES),
    })

    expect(result.error).toBeNull()
    expect(result.path).toContain(UID)
  })

  it('rejects an empty file', async () => {
    const result = await uploadFile({
      bucket: 'pickup-photos',
      userId: UID,
      file: fakeFile('empty.jpg', 0),
    })

    expect(result.path).toBeNull()
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('refuses to upload without a user id — the path would fail RLS anyway', async () => {
    const result = await uploadFile({
      bucket: 'pickup-photos',
      userId: '',
      file: fakeFile('photo.jpg', 1024),
    })

    expect(result.error).toBe('Not signed in.')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('never overwrites an existing object', async () => {
    mockUpload.mockResolvedValue({ error: null })

    await uploadFile({
      bucket: 'pickup-photos',
      userId: UID,
      file: fakeFile('photo.jpg', 1024),
    })

    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringContaining(UID),
      expect.anything(),
      expect.objectContaining({ upsert: false }),
    )
  })

  it('returns the Supabase error message rather than throwing', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } })

    const result = await uploadFile({
      bucket: 'pickup-photos',
      userId: UID,
      file: fakeFile('photo.jpg', 1024),
    })

    expect(result.path).toBeNull()
    expect(result.error).toContain('row-level security')
  })
})
