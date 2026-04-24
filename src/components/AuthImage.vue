<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { getRawUrl } from '../api'

const props = defineProps<{ path: string; alt?: string }>()
const blobUrl = ref('')

async function load() {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
  blobUrl.value = ''
  try {
    const token = localStorage.getItem('auth_token') || ''
    const res = await fetch(getRawUrl(props.path), { headers: { 'X-Auth': token } })
    if (res.ok) blobUrl.value = URL.createObjectURL(await res.blob())
  } catch {}
}

watch(() => props.path, load, { immediate: true })
onBeforeUnmount(() => { if (blobUrl.value) URL.revokeObjectURL(blobUrl.value) })
</script>
<template>
  <img v-if="blobUrl" :src="blobUrl" :alt="alt" class="w-full h-full object-cover" />
  <span v-else class="material-icons-round text-5xl text-[#1a73e8]">image</span>
</template>
