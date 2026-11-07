<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue';
import AppFooter from '@/components/AppFooter.vue';
import MapView from '@/map/MapView.vue';
</script>

<template>
  <div class="layout">
    <AppHeader />
    <main class="layout__map">
      <MapView />
    </main>
    <AppFooter />
  </div>
</template>

<style scoped lang="scss">
.layout {
  display: flex;
  flex-direction: column;
  height: 100%;

  &__map {
    position: relative;
    flex: 1;
    min-height: 0;
  }
}
</style>
