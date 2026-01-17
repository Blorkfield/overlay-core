<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { OverlayScene, type RainEffectConfig } from '@blorkfield/overlay-core';

  export let text: string = 'Hello Svelte';
  export let rainEnabled: boolean = true;
  export let spawnRate: number = 3;

  let container: HTMLDivElement;
  let scene: OverlayScene | null = null;
  let objectCount = 0;

  onMount(async () => {
    const { canvas, bounds } = OverlayScene.createContainer(container, {
      fullscreen: true
    });

    scene = new OverlayScene(canvas, {
      bounds,
      gravity: 1,
      wrapHorizontal: true,
      background: '#16213e',
      floorConfig: {
        segments: 8,
        threshold: 40
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      scene?.setMousePosition(e.clientX - rect.left, e.clientY - rect.top);
    });

    scene.onUpdate((data) => {
      objectCount = data.objects.length;
    });

    await scene.initializeFonts('/fonts/');

    const centerX = bounds.right * 0.25;
    const centerY = bounds.bottom * 0.35;

    await scene.addTextObstacles({
      text,
      x: centerX,
      y: centerY,
      letterSize: 50,
      pressureThreshold: { value: 6 },
      weight: { value: 3 },
      shadow: { opacity: 0.25 },
      clickToFall: { clicks: 2 }
    });

    updateRainEffect();
    scene.start();

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (scene && container) {
        scene.resize(container.clientWidth, container.clientHeight);
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  });

  onDestroy(() => {
    scene?.destroy();
  });

  function updateRainEffect() {
    if (!scene) return;

    const config: RainEffectConfig = {
      id: 'rain',
      type: 'rain',
      enabled: rainEnabled,
      spawnRate,
      objectConfigs: [{
        objectConfig: {
          fillStyle: '#e94560',
          tags: ['falling', 'grabable']
        },
        probability: 1,
        minScale: 0.7,
        maxScale: 1.3,
        baseRadius: 12
      }]
    };

    scene.setEffect(config);
  }

  function spawnObject() {
    if (!scene) return;
    const bounds = { right: container.clientWidth };
    const x = Math.random() * bounds.right * 0.8 + bounds.right * 0.1;

    scene.spawnObject({
      x,
      y: 40,
      radius: 12 + Math.random() * 8,
      fillStyle: '#4ae945',
      tags: ['falling', 'grabable']
    });
  }

  function releaseAll() {
    scene?.releaseAllObjects();
  }

  // React to prop changes
  $: if (scene) {
    updateRainEffect();
  }
</script>

<div class="wrapper">
  <div class="controls">
    <button on:click={spawnObject}>Spawn</button>
    <button on:click={releaseAll}>Release All</button>
    <label>
      <input type="checkbox" bind:checked={rainEnabled} />
      Rain
    </label>
    <label>
      Rate:
      <input type="range" min="1" max="20" bind:value={spawnRate} />
      {spawnRate}
    </label>
    <span class="count">Objects: {objectCount}</span>
  </div>
  <div class="container" bind:this={container}></div>
</div>

<style>
  .wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .container {
    flex: 1;
    width: 100%;
  }

  .controls {
    padding: 12px 16px;
    background: #0f0f1a;
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }

  button {
    padding: 6px 14px;
    background: #4a90d9;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }

  button:hover {
    background: #3a80c9;
  }

  label {
    color: #aaa;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  input[type="checkbox"] {
    cursor: pointer;
  }

  input[type="range"] {
    width: 80px;
  }

  .count {
    color: #666;
    font-size: 12px;
    margin-left: auto;
  }
</style>
