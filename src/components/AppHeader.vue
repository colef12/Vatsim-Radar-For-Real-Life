<script setup lang="ts">
const logo = `${import.meta.env.BASE_URL}favicon.svg`;
</script>

<template>
  <header class="header">
    <div class="header__brand">
      <img class="header__logo" :src="logo" alt="" width="20" height="20" />
      <span>Radar</span>
      <span class="header__tag">Real-World</span>
    </div>
  </header>
</template>

<style scoped lang="scss">
.header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 16px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--stroke);

  &__brand {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 15px;
    font-weight: 700;
  }

  &__tag {
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--brand);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }
}
</style>
