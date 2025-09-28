<script setup lang="ts">
import HomeView from './views/HomeView.vue'
</script>

<template>
  <div id="app">
    <main>
      <HomeView />
    </main>
  </div>
</template>

<style scoped>
#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

main {
  flex: 1;
  padding: 2rem;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

</style>
