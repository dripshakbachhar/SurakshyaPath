'use strict';

(() => {
  const canvas = document.querySelector('#route-scene');
  const host = document.querySelector('.hero-visual');
  if (!canvas || !host || !window.THREE) return;

  try {
    const THREE = window.THREE;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
    camera.position.set(0, 0, 8.5);

    const sculpture = new THREE.Group();
    scene.add(sculpture);

    const globe = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.75, 2),
      new THREE.MeshBasicMaterial({ color: 0x7cc9bd, wireframe: true, transparent: true, opacity: 0.2 })
    );
    sculpture.add(globe);

    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(2.18, 0.007, 6, 180),
      new THREE.MeshBasicMaterial({ color: 0x74c7b5, transparent: true, opacity: 0.45 })
    );
    orbit.rotation.set(1.05, 0.3, -0.48);
    sculpture.add(orbit);

    const points = [
      new THREE.Vector3(-1.5, -0.78, 0.38),
      new THREE.Vector3(-1.03, -0.38, 0.62),
      new THREE.Vector3(-0.49, -0.52, 0.5),
      new THREE.Vector3(-0.03, 0.03, 0.2),
      new THREE.Vector3(0.39, 0.15, 0.02),
      new THREE.Vector3(0.61, 0.73, -0.12),
      new THREE.Vector3(1.31, 1.02, -0.36)
    ];
    const path = new THREE.CatmullRomCurve3(points);
    sculpture.add(new THREE.Mesh(
      new THREE.TubeGeometry(path, 96, 0.025, 8, false),
      new THREE.MeshBasicMaterial({ color: 0x61c7b3, transparent: true, opacity: 0.95 })
    ));

    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0xf3a744 })
    );
    marker.position.copy(points[points.length - 1]);
    sculpture.add(marker);
    const markerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0xe8993e, transparent: true, opacity: 0.13 })
    );
    markerGlow.position.copy(marker.position);
    sculpture.add(markerGlow);

    const nodeGeometry = new THREE.SphereGeometry(0.045, 12, 12);
    points.slice(1, -1).forEach((point, index) => {
      const node = new THREE.Mesh(
        nodeGeometry,
        new THREE.MeshBasicMaterial({ color: index === 2 ? 0xf3a744 : 0xb5e1cf, transparent: true, opacity: 0.8 })
      );
      node.position.copy(point);
      sculpture.add(node);
    });

    const starPositions = new Float32Array(540);
    for (let i = 0; i < starPositions.length; i += 3) {
      starPositions[i] = (Math.random() - 0.5) * 7.5;
      starPositions[i + 1] = (Math.random() - 0.5) * 6.5;
      starPositions[i + 2] = (Math.random() - 0.5) * 3 - 1;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    scene.add(new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({ color: 0xa2d5c9, size: 0.018, transparent: true, opacity: 0.58 })
    ));

    function resize() {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }

    let frame = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let inView = true;
    function animate() {
      if (!inView || document.hidden) { frame = 0; return; }
      if (!reducedMotion) {
        sculpture.rotation.y += 0.0016;
        sculpture.rotation.x = Math.sin(performance.now() * 0.00022) * 0.07;
        markerGlow.scale.setScalar(1 + Math.sin(performance.now() * 0.002) * 0.12);
      }
      renderer.render(scene, camera);
      if (!reducedMotion) frame = requestAnimationFrame(animate);
    }
    const observer = new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting;
      if (inView && !frame) animate();
    });
    observer.observe(host);
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && inView && !frame && !reducedMotion) animate();
    });
    resize();
    if (reducedMotion) renderer.render(scene, camera);
    else animate();
  } catch (error) {
    console.warn('Three.js route visual is unavailable:', error);
  }
})();
