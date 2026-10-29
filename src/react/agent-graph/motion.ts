/** Brand owns complete duration/easing roles. Keep properties explicit. */
export const MOTION_CONTROL = "[transition:color_var(--motion-control),background-color_var(--motion-control),border-color_var(--motion-control),box-shadow_var(--motion-control),transform_var(--motion-control),scale_var(--motion-control),opacity_var(--motion-control)] motion-reduce:transition-none"

/** Technical floating surfaces may change opacity/transform, never layout. */
export const MOTION_SURFACE = "[transition:opacity_var(--motion-surface),transform_var(--motion-surface)] motion-reduce:transition-none"
