<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useTrafficStore } from '@/stores/traffic';
import { PROVIDER_INFO } from '@/data/aircraft';

const traffic = useTrafficStore();
const now = ref(Date.now());
const tick = setInterval(() => (now.value = Date.now()), 1000);
onBeforeUnmount(() => clearInterval(tick));

const view = computed(() => {
  const s = traffic.status;
  switch (s.state) {
    case 'disabled':
      return { tone: 'off', text: 'Traffic relay not connected' };
    case 'loading':
      return { tone: 'wait', text: 'Traffic loading…' };
    case 'error':
      return {
        tone: 'bad',
        text: `Traffic error (${s.message}) · retry ${Math.round(s.retryInMs / 1000)} s`,
      };
    case 'ok': {
      const age = Math.max(0, Math.round((now.value - s.at) / 1000));
      const src = traffic.provider ? PROVIDER_INFO[traffic.provider].name : '—';
      return { tone: age > 20 ? 'wait' : 'ok', text: `${traffic.count} aircraft · ${src} · ${age} s` };
    }
  }
  return { tone: 'off', text: '' };
});
</script>

<template>
  <div class="pill" :class="`pill--${view.tone}`" :title="view.text">
    <span class="pill__dot" />
    <span class="pill__text">{{ view.text }}</span>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.pill {
  display: flex;
  gap: 6px;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--stroke);
  border-radius: 13px;
  background: var(--bg-3);
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 11px;
  white-space: nowrap;

  &__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-2);
  }

  &--ok &__dot {
    background: #4a9c25;
  }

  &--wait &__dot {
    background: #f0bb01;
  }

  &--bad &__dot {
    background: var(--error);
  }

  &--ok &__text {
    color: var(--text-1);
  }

  @include mobileOnly {
    &__text {
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}
</style>
