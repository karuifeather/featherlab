<template>
  <SiteNav />
  <main id="main-content">
    <HeroSection />
    <InsideLabSection />
    <GradingSection />
    <CurriculumSection />
    <GettingStartedSection />
    <FAQSection />
  </main>
  <SiteFooter />
</template>

<script setup lang="ts">
import SiteNav from "./components/SiteNav.vue";
import HeroSection from "./components/HeroSection.vue";
import InsideLabSection from "./components/InsideLabSection.vue";
import GradingSection from "./components/GradingSection.vue";
import CurriculumSection from "./components/CurriculumSection.vue";
import GettingStartedSection from "./components/GettingStartedSection.vue";
import FAQSection from "./components/FAQSection.vue";
import SiteFooter from "./components/SiteFooter.vue";
</script>
