<script setup>
</script>

<template>
  <div class="app-root">
    <div class="glow-field" aria-hidden="true">
      <span class="blob blob-cyan" />
      <span class="blob blob-violet" />
      <span class="blob blob-pink" />
    </div>
    <router-view v-slot="{ Component }">
      <transition name="page" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>

<style>
.app-root {
  position: relative;
  min-height: 100vh;
}
.app-root > :not(.glow-field) {
  position: relative;
  z-index: 1;
}

/* ── 背景光斑(漂浮的霓虹光) ── */
.glow-field {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.55;
  animation: blobFloat 20s ease-in-out infinite alternate;
  will-change: transform;
}
.blob-cyan {
  width: 540px;
  height: 540px;
  top: -180px;
  right: -100px;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.5), transparent 65%);
}
.blob-violet {
  width: 480px;
  height: 480px;
  bottom: -160px;
  left: -110px;
  background: radial-gradient(circle, rgba(167, 139, 250, 0.48), transparent 65%);
  animation-delay: -7s;
}
.blob-pink {
  width: 400px;
  height: 400px;
  top: 36%;
  left: 56%;
  background: radial-gradient(circle, rgba(251, 113, 133, 0.28), transparent 65%);
  animation-delay: -13s;
}
@keyframes blobFloat {
  0% {
    transform: translate(0, 0) scale(1);
  }
  100% {
    transform: translate(-46px, 34px) scale(1.09);
  }
}
</style>