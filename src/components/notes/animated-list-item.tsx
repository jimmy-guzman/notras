"use client";

import type { ReactNode } from "react";

import { motion } from "motion/react";

const STAGGER_DELAY = 0.06;

export function AnimatedListItem({
  children,
  index,
}: {
  children: ReactNode;
  index: number;
}) {
  return (
    <motion.li
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 10 }}
      transition={{
        damping: 30,
        delay: index * STAGGER_DELAY,
        stiffness: 300,
        type: "spring",
      }}
    >
      {children}
    </motion.li>
  );
}
