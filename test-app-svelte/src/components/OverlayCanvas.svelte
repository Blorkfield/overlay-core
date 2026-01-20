<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { OverlayScene, type RainEffectConfig } from '@blorkfield/overlay-core';

  let wrapper: HTMLDivElement;
  let container: HTMLDivElement;
  let contentBox: HTMLDivElement;
  let scene: OverlayScene | null = null;

  // Layout constants - matching borkfield-site
  const WELCOME_Y = 80;
  const VERTICAL_GAP = 30;
  const FLOOR_PADDING = 60;

  onMount(async () => {
    // Small delay to ensure DOM is fully ready
    await new Promise(r => setTimeout(r, 10));

    const width = container.clientWidth;
    const centerX = width * 0.5;

    // Create canvas with temporary height, will resize after calculating layout
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    // Temporary height for initial scene creation
    const tempHeight = 1000;
    canvas.height = tempHeight;

    scene = new OverlayScene(canvas, {
      bounds: { top: 0, bottom: tempHeight, left: 0, right: width },
      gravity: 1,
      wrapHorizontal: true,
      background: '#1a1b26',
      floorConfig: {
        segments: 10,
        threshold: 100,
        thickness: 4,
        color: '#565f89'
      },
      despawnBelowFloor: 0.5
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      scene?.setMousePosition(e.clientX - rect.left, e.clientY - rect.top);
    });

    await scene.initializeFonts('/fonts/');

    // "Welcome to Blorkfield" - centered
    const welcomeResult = await scene.addTextObstacles({
      text: 'Welcome to Blorkfield',
      x: centerX,
      y: WELCOME_Y,
      align: 'center',
      letterSize: 60,
      pressureThreshold: { value: 9 },
      weight: { value: 10 },
      shadow: { opacity: 0.3 },
      clickToFall: { clicks: 2 },
      tags: ['grabable']
    });

    // "Build Stuff" - left-aligned with Welcome text
    const robotoFont = scene.getAvailableFonts().find(f => f.name === 'Roboto');
    const buildFontSize = 40;
    const buildY = welcomeResult.bounds.bottom + VERTICAL_GAP + (buildFontSize * 0.8);
    let buildBottom = buildY + buildFontSize * 0.2;

    if (robotoFont?.fontUrl) {
      const buildResult = await scene.addTTFTextObstacles({
        text: 'Build Stuff',
        x: welcomeResult.bounds.left,
        y: buildY,
        align: 'left',
        fontSize: buildFontSize,
        fontUrl: robotoFont.fontUrl,
        fillColor: '#8BA4C7',
        pressureThreshold: { value: 9 },
        weight: { value: 10 },
        shadow: { opacity: 0.3 },
        clickToFall: { clicks: 2 },
        tags: ['grabable']
      });
      buildBottom = buildResult.bounds.bottom;
    }

    // Content box - centered, below Build Stuff
    // KEY DIFFERENCE: Position is calculated from physics, not CSS
    const boxRect = contentBox.getBoundingClientRect();
    const boxX = centerX;
    const boxY = buildBottom + VERTICAL_GAP + boxRect.height / 2;

    scene.spawnObject({
      element: contentBox,
      x: boxX,
      y: boxY,
      width: boxRect.width,
      height: boxRect.height,
      tags: ['content-obstacle', 'grabable'],
      pressureThreshold: { value: 100 },
      weight: { value: 1000 },
      shadow: { opacity: 0.3 },
      clickToFall: { clicks: 10 }
    });

    // Calculate final height and resize
    const totalHeight = boxY + boxRect.height / 2 + FLOOR_PADDING;
    wrapper.style.height = `${totalHeight}px`;
    canvas.height = totalHeight;
    scene.resize(width, totalHeight);

    const rainConfig: RainEffectConfig = {
      id: 'rain',
      type: 'rain',
      enabled: true,
      spawnRate: 3,
      objectConfigs: [{
        objectConfig: {
          imageUrl: '/bf_koban_512.png',
          tags: ['falling', 'grabable']
        },
        probability: 1,
        minScale: 1,
        maxScale: 1,
        baseRadius: 10
      }]
    };

    scene.setEffect(rainConfig);
    scene.start();

    const resizeObserver = new ResizeObserver(() => {
      if (scene && container) {
        const newWidth = container.clientWidth;
        scene.resize(newWidth, totalHeight);
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
</script>

<div class="overlay-wrapper" bind:this={wrapper}>
  <div class="overlay-container" bind:this={container}></div>
  <div class="content-box" bind:this={contentBox}>
    <h2>What We Do</h2>
    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>

    <h2>Our Mission</h2>
    <p>Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>

    <h2>Why Choose Us</h2>
    <p>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem.</p>

    <h2>Our Approach</h2>
    <p>At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga. Et harum quidem rerum facilis est et expedita distinctio.</p>

    <h2>Get Started Today</h2>
    <p>Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus. Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae.</p>

    <h2>Our Services</h2>
    <p>Itaque earum rerum hic tenetur a sapiente delectus, ut aut reiciendis voluptatibus maiores alias consequatur aut perferendis doloribus asperiores repellat. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam.</p>

    <h2>Contact Us</h2>
    <p>Eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.</p>
  </div>
</div>

<style>
  .overlay-wrapper {
    position: relative;
    width: 100%;
  }

  .overlay-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  /* CRITICAL: Content box uses top: 0, not percentage positioning
     This ensures the element starts at a known position before physics takes over */
  .content-box {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 500px;
    max-width: 90%;
    background: var(--bg-card);
    border: 2px solid var(--text-muted);
    border-radius: 8px;
    padding: 1.5rem 2rem;
    pointer-events: none;
  }

  .content-box h2 {
    color: var(--accent-blue);
    font-size: 1.25rem;
    margin-bottom: 0.5rem;
    margin-top: 1rem;
  }

  .content-box h2:first-child {
    margin-top: 0;
  }

  .content-box p {
    color: var(--text-primary);
    font-size: 0.9rem;
    line-height: 1.6;
    margin-bottom: 0.5rem;
  }
</style>
