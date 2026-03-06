"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  BarChart3,
  Bot,
  Zap,
} from "lucide-react";
import { clsx } from "clsx";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Post Queue", href: "/dashboard/posts", icon: FileText },
  { name: "Comments", href: "/dashboard/comments", icon: MessageSquare },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Agent Runs", href: "/dashboard/agent", icon: Bot },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-gray-900 flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-700">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="text-white font-bold text-sm">TX2Pay</div>
          <div className="text-gray-400 text-xs">FB Business Agent</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-700">
        <div className="text-xs text-gray-500">
          Powered by Claude claude-sonnet-4-6
        </div>
      </div>
    </aside>
  );
}
