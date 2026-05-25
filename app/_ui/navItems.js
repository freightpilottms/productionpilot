export const primaryTabs = [
  { label: "Kupci", href: "/kupci", icon: "users" },
  { label: "Dobavlja\u010di", href: "/dobavljaci", icon: "truck" },
  { label: "Home", href: "/home", icon: "home" },
  { label: "Zalihe", href: "/zalihe", icon: "boxes" },
  {
    label: "Vi\u0161e",
    href: "/vise",
    icon: "more",
    activePaths: ["/racuni", "/zaduzenja", "/izdani-racuni", "/inventura", "/kartica", "/prijem-robe", "/otvorene-stavke", "/restaurant-app"],
  },
];

export function isNavItemActive(pathname, item) {
  const p = pathname || "";
  if (p === item.href || p.startsWith(`${item.href}/`)) return true;
  return (item.activePaths || []).some((path) => p === path || p.startsWith(`${path}/`));
}

export function NavIcon({ name }) {
  const props = {
    className: "navIcon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    focusable: "false",
  };

  if (name === "home") {
    return (
      <svg {...props}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg {...props}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }

  if (name === "truck") {
    return (
      <svg {...props}>
        <path d="M3 6h11v10H3z" />
        <path d="M14 9h4l3 3v4h-7z" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="18" r="2" />
      </svg>
    );
  }

  if (name === "receipt") {
    return (
      <svg {...props}>
        <path d="M6 3h12v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L6 21z" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
        <path d="M9 16h4" />
      </svg>
    );
  }

  if (name === "bank") {
    return (
      <svg {...props}>
        <path d="M3 10h18" />
        <path d="M5 10v8" />
        <path d="M9 10v8" />
        <path d="M15 10v8" />
        <path d="M19 10v8" />
        <path d="M4 18h16" />
        <path d="M12 3 3 8h18z" />
      </svg>
    );
  }

  if (name === "credit") {
    return (
      <svg {...props}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 15h4" />
      </svg>
    );
  }

  if (name === "inventory") {
    return (
      <svg {...props}>
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <path d="M3.3 7 12 12l8.7-5" />
        <path d="M12 22V12" />
      </svg>
    );
  }

  if (name === "info") {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10v6" />
        <path d="M12 7h.01" />
      </svg>
    );
  }

  if (name === "moon") {
    return (
      <svg {...props}>
        <path d="M20.6 14.4A8 8 0 0 1 9.6 3.4 8.3 8.3 0 1 0 20.6 14.4z" />
      </svg>
    );
  }

  if (name === "sun") {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
    );
  }

  if (name === "boxes") {
    return (
      <svg {...props}>
        <path d="M3 7.5 8 5l5 2.5-5 2.5z" />
        <path d="M8 10v6l-5-2.5v-6" />
        <path d="m8 16 5-2.5v-6" />
        <path d="m11 12.5 5-2.5 5 2.5-5 2.5z" />
        <path d="M16 15v6l-5-2.5v-6" />
        <path d="m16 21 5-2.5v-6" />
      </svg>
    );
  }

  if (name === "scan") {
    return (
      <svg {...props}>
        <path d="M4 8V5.8C4 4.8 4.8 4 5.8 4H8" />
        <path d="M16 4h2.2C19.2 4 20 4.8 20 5.8V8" />
        <path d="M20 16v2.2c0 1-.8 1.8-1.8 1.8H16" />
        <path d="M8 20H5.8C4.8 20 4 19.2 4 18.2V16" />
        <path d="M6 12h12" />
        <path d="M8 9h8" />
        <path d="M8 15h5" />
      </svg>
    );
  }

  if (name === "restaurant") {
    return (
      <svg {...props}>
        <path d="M7 3v8" />
        <path d="M4 3v5a3 3 0 0 0 6 0V3" />
        <path d="M7 11v10" />
        <path d="M17 3v18" />
        <path d="M14 3h3a3 3 0 0 1 3 3v5h-6z" />
      </svg>
    );
  }

  return (
    <svg {...props}>
      <circle cx="5" cy="5" r="1.8" />
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="19" cy="5" r="1.8" />
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
      <circle cx="5" cy="19" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
      <circle cx="19" cy="19" r="1.8" />
    </svg>
  );
}
