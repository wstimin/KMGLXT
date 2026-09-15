<script setup>
import { computed } from 'vue'
import IconFrame from './IconFrame.vue'
import { useCountUp } from '@/composables/useCountUp'

const props = defineProps({
  icon: { type: String, required: true },
  label: { type: String, required: true },
  value: { type: Number, default: 0 },
  unit: { type: String, default: '' },
  caption: { type: String, default: '' },
})

const display = useCountUp(computed(() => props.value))
</script>

<template>
  <div class="glass glass-hover hero-stat">
    <div class="hero-top">
      <IconFrame :name="icon" :size="22" />
      <span class="hero-label">{{ label }}</span>
    </div>
    <div class="hero-value num">
      <span class="hero-value-num">{{ display }}<i v-if="unit" class="hero-unit">{{ unit }}</i></span>
    </div>
    <div v-if="caption" class="hero-caption">{{ caption }}</div>
  </div>
</template>

<style scoped>
.hero-stat {
  position: relative;
  overflow: hidden;
  padding: 20px 24px;
}
.hero-stat::after {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  background: var(--grad-main);
  opacity: 0.85;
}
.hero-top {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 500;
}
.hero-value {
  margin-top: 14px;
}
.hero-value-num {
  display: inline-flex;
  align-items: baseline;
  font-size: 34px;
  font-weight: 700;
  color: var(--ink-1);
  line-height: 1;
}
.hero-unit {
  font-style: normal;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-3);
  margin-left: 6px;
}
.hero-caption {
  margin-top: 8px;
  font-size: 12px;
  color: var(--ink-3);
}
</style>