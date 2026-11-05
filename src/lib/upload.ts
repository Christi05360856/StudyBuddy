// Uploads a file to Supabase Storage and reports progress (0 to 100).
// supabase-js cannot report progress, so this talks to Storage directly.

export function uploadToStorage(options: {
  bucket: string
  path: string
  file: File
  accessToken: string
  onProgress: (percent: number) => void
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const safePath = options.path.split("/").map(encodeURIComponent).join("/")
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${options.bucket}/${safePath}`

    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)
    xhr.setRequestHeader("Authorization", `Bearer ${options.accessToken}`)
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    xhr.setRequestHeader("x-upsert", "false")

    // Called many times while the file is going up
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        // Stay at 99 until the server confirms it is finished
        options.onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress(100)
        resolve()
        return
      }
      let message = "Upload failed"
      try {
        message = JSON.parse(xhr.responseText).message || message
      } catch {
        // keep the default message
      }
      reject(new Error(message))
    }

    xhr.onerror = () => reject(new Error("Network problem during upload. Check your internet and try again."))

    const form = new FormData()
    form.append("cacheControl", "3600")
    form.append("", options.file)
    xhr.send(form)
  })
}
