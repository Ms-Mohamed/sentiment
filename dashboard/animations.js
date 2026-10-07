/**
 * Shared GSAP animation utilities.
 */

/**
 * Checks if the user prefers reduced motion.
 * @returns {boolean}
 */
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Animates a number transition in an element.
 * @param {HTMLElement} el 
 * @param {number} from 
 * @param {number} to 
 * @param {number} decimals 
 */
function animateNumber(el, from, to, decimals = 1) {
    if (prefersReducedMotion()) {
        el.innerText = to.toFixed(decimals);
        return;
    }
    const obj = { val: from };
    gsap.to(obj, {
        val: to,
        duration: 1.5,
        ease: "power2.out",
        onUpdate: () => {
            el.innerText = obj.val.toFixed(decimals);
        }
    });
}

/**
 * Flashes the background of an element with a specific color.
 * @param {HTMLElement} el 
 * @param {string} color 
 * @param {number} duration 
 */
function flashBackground(el, color, duration = 1) {
    if (prefersReducedMotion()) return;
    gsap.fromTo(el, 
        { backgroundColor: color }, 
        { backgroundColor: "transparent", duration: duration, ease: "power2.inOut" }
    );
}

/**
 * Entrance animation: slides element in from top.
 * @param {HTMLElement|string} el 
 * @param {number} delay 
 */
function slideInFromTop(el, delay = 0) {
    if (prefersReducedMotion()) {
        gsap.set(el, { opacity: 1, y: 0 });
        return;
    }
    gsap.fromTo(el, 
        { opacity: 0, y: -50 }, 
        { opacity: 1, y: 0, duration: 1, delay: delay, ease: "power3.out" }
    );
}

/**
 * Entrance animation: slides element in from left.
 * @param {HTMLElement|string} el 
 * @param {number} delay 
 */
function slideInFromLeft(el, delay = 0) {
    if (prefersReducedMotion()) {
        gsap.set(el, { opacity: 1, x: 0 });
        return;
    }
    gsap.fromTo(el, 
        { opacity: 0, x: -30 }, 
        { opacity: 1, x: 0, duration: 1, delay: delay, ease: "power3.out" }
    );
}

/**
 * Entrance animation: slides element in from right.
 * @param {HTMLElement|string} el 
 * @param {number} delay 
 */
function slideInFromRight(el, delay = 0) {
    if (prefersReducedMotion()) {
        gsap.set(el, { opacity: 1, x: 0 });
        return;
    }
    gsap.fromTo(el, 
        { opacity: 0, x: 30 }, 
        { opacity: 1, x: 0, duration: 1, delay: delay, ease: "power3.out" }
    );
}

/**
 * Shakes an element horizontally (for alerts or errors).
 * @param {HTMLElement} el 
 */
function shakeElement(el) {
    if (prefersReducedMotion()) return;
    gsap.fromTo(el, 
        { x: -5 }, 
        { x: 5, duration: 0.1, repeat: 5, yoyo: true, ease: "none" }
    );
}

/**
 * Pop effect for when a task or transition completes.
 * @param {HTMLElement} el 
 */
function popComplete(el) {
    if (prefersReducedMotion()) return;
    gsap.fromTo(el, 
        { scale: 1 }, 
        { scale: 1.1, duration: 0.2, yoyo: true, repeat: 1, ease: "back.out(2)" }
    );
}
