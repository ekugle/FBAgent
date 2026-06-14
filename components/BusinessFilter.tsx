"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const BUSINESSES = [
  { key: "", label: "All Businesses" },
  { key: "tx2pay", label: "TX2Pay" },
  { key: "endorsements", label: "eEndorsements" },
];

interface Props {
  current: string;
  // extra URL params to preserve when switching business
  extraParams?: Record<string, string>;
}

export default function BusinessFilter({ current, extraParams = {} }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function go(pageKey: string) {
    const params = new URLSearchParams(extraParams);
    if (pageKey) params.set("page", pageKey);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
      {BUSINESSES.map((b) => (
        <button
          key={b.key}
          onClick={() => go(b.key)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            current === b.key
              ? b.key === "endorsements"
                ? "bg-white text-purple-700 shadow-sm"
                : b.key === "tx2pay"
                ? "bg-white text-blue-700 shadow-sm"
                : "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
