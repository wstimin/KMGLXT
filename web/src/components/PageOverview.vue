<script setup>
import { ref, onMounted, watch } from 'vue'
import { get } from '@/lib/request'
import HeroStat from './HeroStat.vue'

/**
 * 每页顶部「数据总览」行。
 * 依据 scope 拉取 stats/page-summary 的指标,渲染成一排玻璃统计卡。
 * scope: cards | types | projects | logs
 */
const props = defineProps({
  scope: { type: String, required: true },
})

const CONFIG = {
  cards: [
    { key: 'total', icon: 'cards', label: '卡密总数', unit: '张', caption: '全局统一卡池' },
    { key: 'unused', icon: 'clock', label: '未使用', unit: '张', caption: '等待激活' },
    { key: 'used', icon: 'check', label: '已使用', unit: '张', caption: '已核销激活' },
    { key: 'stale', icon: 'ban', label: '已过期/禁用', unit: '张', caption: '失效卡密' },
    { key: 'generated_today', icon: 'sparkles', label: '今日生成', unit: '张', caption: '今日新增卡密' },
    { key: 'consumed_today', icon: 'play', label: '今日核销', unit: '次', caption: '今日激活与扣次' },
  ],
  types: [
    { key: 'type_count', icon: 'tag', label: '套餐数量', unit: '个', caption: '全部商品套餐' },
    { key: 'card_total', icon: 'cards', label: '卡密总数', unit: '张', caption: '所有套餐累计' },
    { key: 'unused', icon: 'clock', label: '未使用', unit: '张', caption: '等待激活' },
    { key: 'used', icon: 'check', label: '已使用', unit: '张', caption: '已核销激活' },
    { key: 'stale', icon: 'ban', label: '已失效', unit: '张', caption: '过期 + 禁用' },
  ],
  projects: [
    { key: 'project_total', icon: 'globe', label: '项目总数', unit: '个', caption: '全部接入项目' },
    { key: 'project_active', icon: 'server', label: '启用中', unit: '个', caption: '当前可验卡' },
    { key: 'today_consumed', icon: 'play', label: '今日核销', unit: '次', caption: '今日激活与扣次' },
    { key: 'bound_cards', icon: 'link', label: '已绑定卡', unit: '张', caption: '已归属项目的卡' },
  ],
  logs: [
    { key: 'today_total', icon: 'logs', label: '今日操作', unit: '条', caption: '验卡/激活等全部' },
    { key: 'today_activate', icon: 'check', label: '今日激活', unit: '次', caption: '卡密成功激活' },
    { key: 'today_consume', icon: 'minus', label: '今日扣次', unit: '次', caption: '次数卡扣减' },
    { key: 'today_rejected', icon: 'alert', label: '被拒绝', unit: '次', caption: '校验未通过' },
    { key: 'today_oper', icon: 'shield', label: '后台操作', unit: '条', caption: '操作审计入账' },
  ],
}

const conf = CONFIG[props.scope] || []
const metrics = ref({})

async function load() {
  try {
    metrics.value = await get(`/api/admin/stats/page-summary?scope=${props.scope}`)
  } catch {
    /* 静默:总览数据缺失不影响页面主体 */
  }
}

onMounted(load)
watch(() => props.scope, load)
</script>

<template>
  <div class="page-overview">
    <HeroStat
      v-for="c in conf"
      :key="c.key"
      :icon="c.icon"
      :label="c.label"
      :value="metrics[c.key] ?? 0"
      :unit="c.unit"
      :caption="c.caption"
    />
  </div>
</template>

<style scoped>
.page-overview {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(188px, 1fr));
  gap: 14px;
  margin: 20px 0 6px;
}
</style>