import { ref, onMounted, watch } from 'vue'

/** 数字滚动动画(easeOutCubic),用于 hero 统计卡片 */
export function useCountUp(target, { duration = 1200 } = {}) {
  const display = ref(0)
  let raf = 0

  function run() {
    cancelAnimationFrame(raf)
    const from = 0
    const to = Number(target.value ?? 0) || 0
    const start = performance.now()

    const step = (t) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      display.value = Math.round(from + (to - from) * eased)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
  }

  onMounted(run)
  watch(target, run)
  return display
}