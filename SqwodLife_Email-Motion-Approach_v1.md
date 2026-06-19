# Motion & "3D" in the Sqwod Daily email (v1)

*Tee's question: could the newsletter be 3D, in motion, interactive — leading to articles, products, trends? Here's what's real, and the approach.*

## What email actually supports
- **No JS / no WebGL.** Clients strip `<script>`, so true interactive 3D (the drag-to-spin ring) cannot run in an inbox.
- **Motion = GIF (or short video).** Animated GIF is universally supported and is the workhorse for "wow" hero motion (your Hims reference uses a GIF hero). `<video>` works only in Apple Mail + a few; always needs a GIF/poster fallback.
- **CSS animation** works in some clients (Apple Mail, a few others), ignored in Gmail/Outlook — treat as progressive enhancement, never the foundation.
- **AMP-for-Email / kinetic ("interactive") email** exists but support is narrow (AMP: Gmail/Yahoo with sender allowlisting; kinetic checkbox-hacks: mostly Apple Mail) and breaks in Outlook. Bonus layer, not the base.

## The approach (reuses what we built)
1. **Render the spin off-platform.** Same Three.js / Remotion pipeline that powers the site renders each product's 360° rotation.
2. **Export an optimized looping GIF** (short loop, sized to the slot, color-reduced). That GIF is the email hero — motion in every inbox.
3. **Interactivity lives on click-through.** The email is the motion-rich teaser; the real drag-to-explore experience is the landing page it links to (article, product/Sqwod Verified, trend).
4. **One template, changing content.** A fixed premium kinetic layout; the cascade swaps in fresh spin-GIFs + items each issue (one product or many — modular cards). This is "static format, changing content," automated.

## Guardrails
- **Weight discipline.** Keep GIF loops short + optimized; Gmail clips messages > ~102KB of HTML. Lazy-load secondary GIFs; always a static poster first frame.
- **Accessibility/fallback.** Meaningful first frame (reads fine if animation is blocked), `alt` text, no info conveyed by motion alone.
- **Score badges as PNG** in production (Gmail/Outlook strip inline SVG).
- **Test matrix:** Apple Mail, Gmail (web + app), Outlook, before any send.

## Verdict
Cool, yes — and differentiating in a wellness inbox full of flat templates. Done as exported GIFs (not live 3D) it's deliverable, on-brand, and fully automatable from the asset pipeline we already designed.
