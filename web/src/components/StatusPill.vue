<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, required: true },
})

const MAP = {
  unused: ['未使用', 'pill-unused'],
  used: ['已使用', 'pill-used'],
  expired: ['已过期', 'pill-expired'],
  disabled: ['已禁用', 'pill-disabled'],
  void: ['已作废', 'pill-void'],
}

const cur = computed(() => MAP[props.status] || [props.status, 'pill-void'])
</script>

<template>
  <span class="pill" :class="cur[1]">{{ cur[0] }}</span>
</template>