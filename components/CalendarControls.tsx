"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

interface Props {
  weekStart: string;
  prevWeek: string;
  nextWeek: string;
}

export default function CalendarControls({ prevWeek, nextWeek }: Props) {
  return (
    <div className="flex items-center gap-1">
      <Link
        href={prevWeek.startsWith("/") ? prevWeek : `/dashboard/calendar?week=${prevWeek}`}
        className="btn-secondary py-1.5 px-2"
      >
        <ChevronLeft className="w-4 h-4" />
      </Link>
      <Link
        href={nextWeek.startsWith("/") ? nextWeek : `/dashboard/calendar?week=${nextWeek}`}
        className="btn-secondary py-1.5 px-2"
      >
        <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
