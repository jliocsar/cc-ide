import type { Transition, Variants } from 'motion/react'

/** macOS-calm ease. All micro/short durations use this. */
export const easeStandard: Transition['ease'] = [0.25, 0.1, 0.25, 1]

/** Arrival spring — only for "new thing appears" moments (modals, palette, window spawn, new tab). */
export const springArrive: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 32,
  mass: 0.9,
}

/** Snappy layout spring — tab reorder, sidebar rows, window layout. */
export const springLayout: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 36,
}

/** Short linear-ish fade — dropdowns, tooltips. */
export const shortFade: Transition = {
  duration: 0.16,
  ease: easeStandard,
}

export const microFade: Transition = {
  duration: 0.12,
  ease: easeStandard,
}

/** Modal / sheet / dialog / palette entrance. */
export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springArrive },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 4,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
  },
}

/** Modal scrim (the overlay behind the dialog). Plain opacity fade. */
export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: shortFade },
  exit: { opacity: 0, transition: shortFade },
}

/** Dropdown / select content — smaller, anchored. */
export const dropdownVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -4 },
  visible: { opacity: 1, scale: 1, y: 0, transition: shortFade },
  exit: { opacity: 0, scale: 0.98, y: -2, transition: microFade },
}

/** Tooltip — pure opacity. */
export const tooltipVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: microFade },
  exit: { opacity: 0, transition: microFade },
}

/** Canvas window spawn + close. */
export const canvasWindowVariants: Variants = {
  hidden: { opacity: 0, scale: 0.92, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 400, damping: 32 },
  },
  exit: {
    opacity: 0,
    scale: 0.94,
    y: 4,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
  },
}

/** Tab switch — slides content in from the side based on direction (±1). */
export const tabSlideVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 24 : -24,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.22, ease: easeStandard },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -24 : 24,
    opacity: 0,
    transition: { duration: 0.18, ease: easeStandard },
  }),
}

/** App first-mount — content emerges behind the loader. */
export const appEmergeVariants: Variants = {
  hidden: { opacity: 0, scale: 0.985 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.32, ease: easeStandard },
  },
}
