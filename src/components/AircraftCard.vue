<script setup lang="ts">
import { computed } from 'vue';
import { useTrafficStore } from '@/stores/traffic';
import { formatAltitude, formatSpeed, formatVerticalRate } from '@/utils/units';

const traffic = useTrafficStore();
const a = computed(() => traffic.selected);
const route = computed(() => (a.value?.callsign ? traffic.routes[a.value.callsign] : undefined));

const SOURCES: Record<string, string> = {
  adsb_icao: 'ADS-B',
  adsb_icao_nt: 'ADS-B (non-transponder)',
  adsr_icao: 'ADS-R',
  tisb_icao: 'TIS-B',
  tisb_trackfile: 'TIS-B',
  tisb_other: 'TIS-B',
  mlat: 'MLAT',
  mode_s: 'Mode S',
  adsc: 'ADS-C',
};

const rows = computed(() => {
  const x = a.value;
  if (!x) return [];
  return [
    ['Altitude', formatAltitude(x.alt)],
    ['Ground speed', formatSpeed(x.gs)],
    ['Vertical', formatVerticalRate(x.vs)],
    ['Track', x.track == null ? '—' : `${String(Math.round(x.track)).padStart(3, '0')}°`],
    ['Squawk', x.squawk ?? '—'],
    ['Registration', x.reg ?? '—'],
    ['Hex', x.hex.toUpperCase()],
    ['Source', x.source ? (SOURCES[x.source] ?? x.source) : '—'],
  ] as const;
});
</script>

<template>
  <aside v-if="a" class="card" :class="{ 'card--emergency': a.emergency }">
    <header class="card__head">
      <div>
        <div class="card__callsign">{{ a.callsign ?? a.reg ?? a.hex.toUpperCase() }}</div>
        <div class="card__type">
          {{ a.type ?? 'Unknown type' }}<span v-if="a.category" class="card__muted"> · {{ a.category }}</span>
        </div>
      </div>
      <button class="card__close" type="button" aria-label="Close" @click="traffic.select(null)">×</button>
    </header>

    <div v-if="a.emergency" class="card__alert">EMERGENCY · SQUAWK {{ a.squawk ?? '—' }}</div>

    <div class="card__route">
      <template v-if="route?.airports">{{ route.airports.join(' → ') }}</template>
      <span v-else class="card__muted">{{ route ? 'Route unknown' : 'Looking up route…' }}</span>
      <div v-if="route?.airline" class="card__airline">{{ route.airline }}</div>
    </div>

    <dl class="card__grid">
      <template v-for="[k, v] in rows" :key="k">
        <dt>{{ k }}</dt>
        <dd>{{ v }}</dd>
      </template>
    </dl>
  </aside>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.card {
  position: absolute;
  z-index: 5;
  top: 12px;
  right: 12px;
  width: 280px;
  padding: 12px;
  border: 1px solid var(--stroke);
  border-left: 3px solid #d88500;
  border-radius: 8px;
  background: var(--bg-2);
  box-shadow: 0 8px 24px rgb(0 0 0 / 50%);

  &--emergency {
    border-left-color: var(--error);
  }

  &__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  &__callsign {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  &__type {
    margin-top: 2px;
    color: var(--text-1);
    font-family: var(--font-mono);
    font-size: 12px;
  }

  &__muted {
    color: var(--text-2);
  }

  &__close {
    padding: 0 4px;
    border: 0;
    background: none;
    color: var(--text-2);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;

    &:hover {
      color: var(--text-1);
    }
  }

  &__alert {
    margin-top: 8px;
    padding: 4px 6px;
    border-radius: 4px;
    background: var(--error);
    color: #fff;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
  }

  &__route {
    margin-top: 10px;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--bg-3);
    font-family: var(--font-mono);
    font-size: 13px;
  }

  &__airline {
    margin-top: 2px;
    color: var(--text-2);
    font-family: var(--font);
    font-size: 11px;
  }

  &__grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 10px 0 0;
    font-size: 12px;

    dt {
      color: var(--text-2);
    }

    dd {
      margin: 0;
      font-family: var(--font-mono);
      text-align: right;
    }
  }

  @include mobileOnly {
    top: auto;
    right: 8px;
    bottom: 8px;
    left: 8px;
    width: auto;
  }
}
</style>
