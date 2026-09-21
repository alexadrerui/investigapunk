# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

INVESTIGA-PUNK: cena WebGL cyberpunk noir (beco encharcado sob neon, chuva, trovão, outdoors de vídeo, carro, dirigíveis; sempre à noite), com modo caminhada em primeira/terceira pessoa. É uma **recriação em Three.js r186 (WebGPU + TSL)** de um bundle minificado original (r185); muitos valores em `src/config.js` foram extraídos desse bundle. Narrativa/marca em `docs/STORY.md`. UI e textos em pt-BR.

## Comandos

- `npm run dev` — app principal em http://localhost:3000 (Vite, `host: true`)
- `npm run build` / `npm run preview` — build para `dist/` e preview na porta 3000
- `npm run legacy` — serve o bundle original minificado em `legacy/` (porta 3001), útil só como **referência visual/comportamental** para comparar com a recriação

Não há testes, lint nem TypeScript configurados. Verificação é visual, no navegador.

## Arquitetura

Vite + JS puro (ES modules), sem framework. `src/main.js` → `boot()` em `src/app.js`, que é o ponto onde tudo é montado e onde o loop de render vive. Ler `app.js` primeiro.

- **Alias do three:** `vite.config.js` redireciona `three` e `three/webgpu` para `three/build/three.webgpu.js`. Portanto `import * as THREE from "three"` já é a build WebGPU (`WebGPURenderer`, `RenderPipeline`). Materiais e shaders são **TSL/node materials**, não GLSL cru.
- **Renderer** (`core/renderer.js`): tenta WebGPU, cai para backend WebGL (`forceWebGL`) se `init()` falhar. Sombras têm `autoUpdate = false`: são estáticas e renderizadas uma vez via `shadowMap.needsUpdate` no boot. Se mover luz ou geometria que projeta sombra, é preciso marcar `needsUpdate` de novo.
- **Pós-processamento** (`postfx/pipeline.js`, exportado como `createComposer`): um `THREE.RenderPipeline` com `pass(scene, camera)` e MRT (`output` + buffer `bloom` separado) alimentando bloom duplo (tight + wide), GTAO, SMAA, fog volumétrico, rain glass, lensflare e grade de cor. Cada efeito tem um par: `xxx.js` (estado/controle JS) e `xxxTsl.js` (nós TSL). "Looks" (presets de cor/atmosfera) ficam em `look/presets.js` e são aplicados via `post.applyLook(id)`.
- **Mundo** (`world/`): `city.js`, `car.js`, `billboards.js` (planos com os vídeos de `assets.js`), `ground.js` (poças/reflexo), `rain.js` + `collisionHeight.js` (a chuva usa um mapa de altura de colisão para decidir onde bate), `carRain.js`, `sky.js`, `planes.js` (dirigíveis).
- **Colisão:** `core/bvh.js` usa `three-mesh-bvh`; `colider.glb` (nome escrito assim mesmo) é a malha de colisão da cidade. Câmera e personagem fazem raycast contra `[city, boundsCollider, carCollider, ground, ...]`, lista que é montada em `app.js`.
- **Câmera/jogador:** `camera/controls.js` (`createCameraRig`: modos orbit e walk; `setOrbitOnly` é usado pelo modo dev) e `player/footIkCharacter.js` (personagem `ual.glb` + FootIK via `three-player-controller`). Escalas, alturas e nomes de animação do personagem estão em `PLAYER` em `config.js` (unidades do modelo são cm, daí `scale: 1.68/180`).
- **UI** (`ui/`): DOM puro. `intro.js` (sequência de abertura), `chrome.js` (header/about/settings + persistência em localStorage), `walkHud.js`/`walkControls.js`, `audio.js`, `lookBar.js`.
- **Modo dev:** ativado em Settings (chave localStorage `investigapunk.dev`). Liga `ui/inspector.js` (painel para ajustar post, chuva, luz, etc.) e `dev/transformTools.js`, e força a câmera em orbit. `app.js` também expõe `window.__scene/__camera/__renderer/__rig/__post/__transform` para depurar no console.
- **Config central:** `src/config.js` (câmera, jogador, iluminação, `PERF`) e `src/assets.js` (todos os caminhos de modelos/texturas/áudio/vídeo, usados a partir de `public/`). Modelos usam Draco/Basis com decoders em `public/libs/`.
- **DPR adaptativo:** `core/dpr.js` ajusta a resolução em runtime a partir de `PERF`; `PERF.maxPixelRatio` é o teto.

## Pegadinhas

- `src/postfx/stub.js` (`createPostStub`) não é importado por nenhum arquivo; parece resquício.
- `public/` e `legacy/` duplicam vários assets (áudio, modelos, fontes). O app principal lê de `public/`; `legacy/` é independente.
- `dist/` é artefato de build (gitignored).
