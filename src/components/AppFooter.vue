<template>
  <footer class="footer">
    <span class="footer__warn"
      >Not for navigation or ATC. Data is crowd-sourced and may be incomplete or delayed.</span
    >
    <span class="footer__credit">
      Design adapted from
      <a href="https://github.com/VATSIM-Radar/vatsim-radar" target="_blank" rel="noopener">VATSIM Radar</a>
      (<a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener"
        >CC BY-NC 4.0</a
      >)
    </span>
  </footer>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.footer {
  position: relative;
  z-index: 2;
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  height: 28px;
  padding: 0 12px;
  background: var(--bg-2);
  border-top: 1px solid var(--stroke);
  color: var(--text-2);
  font-size: 11px;
  white-space: nowrap;

  &__warn {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @include mobileOnly {
    &__credit {
      display: none;
    }
  }
}
</style>
