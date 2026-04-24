<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { createFolder, uploadFile } from '../api'

const emit = defineEmits<{
  close: []
}>()

const route = useRoute()
const fileInput = ref<HTMLInputElement>()
const folderInput = ref<HTMLInputElement>()

function getCurrentPath(): string {
  const params = route.params.pathMatch
  if (!params) return ''
  if (Array.isArray(params)) return params.join('/')
  return params
}

async function handleNewFolder() {
  const name = prompt('文件夹名称:')
  if (!name) return
  emit('close')
  const currentPath = getCurrentPath()
  const folderPath = currentPath ? `${currentPath}/${name}` : name
  try {
    await createFolder(folderPath)
    window.dispatchEvent(new CustomEvent('drive:refresh'))
  } catch (e) {
    alert(`创建文件夹失败: ${(e as Error).message}`)
  }
}

function handleUploadFileClick() {
  emit('close')
  fileInput.value?.click()
}

function handleUploadFolderClick() {
  emit('close')
  folderInput.value?.click()
}

async function handleFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return
  await doUpload(files, false)
  input.value = ''
}

async function handleFolderSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return
  await doUpload(files, true)
  input.value = ''
}

async function doUpload(files: FileList, isFolder: boolean) {
  const currentPath = getCurrentPath()
  
  // For folder upload: collect unique directories and create them first
  if (isFolder) {
    const dirs = new Set<string>()
    for (const file of files) {
      const rp = (file as any).webkitRelativePath as string
      if (!rp) continue
      const parts = rp.split('/')
      for (let i = 1; i < parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/'))
      }
    }
    const sortedDirs = Array.from(dirs).sort((a, b) => a.split('/').length - b.split('/').length)
    for (const dir of sortedDirs) {
      const fullPath = currentPath ? `${currentPath}/${dir}` : dir
      try { await createFolder(fullPath) } catch { /* 409 = already exists */ }
    }
  }

  let uploaded = 0
  const total = files.length
  for (const file of files) {
    let uploadPath = currentPath
    if (isFolder) {
      const rp = (file as any).webkitRelativePath as string
      if (rp) {
        const dirPart = rp.split('/').slice(0, -1).join('/')
        uploadPath = currentPath ? `${currentPath}/${dirPart}` : dirPart
      }
    }
    try {
      uploaded++
      const label = isFolder ? `(${uploaded}/${total}) ${file.name}` : file.name
      window.dispatchEvent(new CustomEvent('drive:upload-start', { detail: { name: label } }))
      await uploadFile(uploadPath, file, (percent) => {
        window.dispatchEvent(new CustomEvent('drive:upload-progress', { detail: { name: label, percent } }))
      })
      window.dispatchEvent(new CustomEvent('drive:upload-done', { detail: { name: label } }))
    } catch (err) {
      window.dispatchEvent(new CustomEvent('drive:upload-error', { detail: { name: file.name, error: (err as Error).message } }))
    }
  }
  window.dispatchEvent(new CustomEvent('drive:refresh'))
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.new-menu-container')) {
    emit('close')
  }
}

onMounted(() => {
  setTimeout(() => document.addEventListener('click', handleClickOutside), 0)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div
    class="new-menu-container absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg py-1 z-50 w-52 border border-[#dadce0]"
  >
    <button
      @click="handleNewFolder"
      class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left cursor-pointer transition-colors text-[#202124] hover:bg-[#e8f0fe]"
    >
      <span class="material-icons-round text-xl text-[#5f6368]">create_new_folder</span>
      新建文件夹
    </button>
    <div class="my-1 border-t border-[#dadce0]"></div>
    <button
      @click="handleUploadFileClick"
      class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left cursor-pointer transition-colors text-[#202124] hover:bg-[#e8f0fe]"
    >
      <span class="material-icons-round text-xl text-[#5f6368]">upload_file</span>
      上传文件
    </button>
    <button
      @click="handleUploadFolderClick"
      class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left cursor-pointer transition-colors text-[#202124] hover:bg-[#e8f0fe]"
    >
      <span class="material-icons-round text-xl text-[#5f6368]">drive_folder_upload</span>
      上传文件夹
    </button>
    <input
      ref="fileInput"
      type="file"
      multiple
      class="hidden"
      @change="handleFileSelected"
    />
    <input
      ref="folderInput"
      type="file"
      webkitdirectory
      class="hidden"
      @change="handleFolderSelected"
    />
  </div>
</template>
