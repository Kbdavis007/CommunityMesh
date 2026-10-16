import type { ReactNode } from "react";
import {
  Link,
  useRoutes,
  NavLink,
  Outlet,
  type RouteObject,
} from "react-router-dom";

type PageContentProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
};

function PageContent({
  eyebrow,
  title,
  description,
  children,
}: PageContentProps) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-800">
        {eyebrow}
      </p>
      <h1 className="max-w-3xl text-4xl font-bold leading-tight text-stone-950 sm:text-5xl">
        {title}
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-700">
        {description}
      </p>
      {children}
    </section>
  );
}

function AppLayout() {
  const navigation = [
    { to: "/", label: "Home", end: true },
    { to: "/hub", label: "Local hub" },
    { to: "/listings", label: "Listings" },
    { to: "/tasks", label: "Tasks" },
    { to: "/governance", label: "Governance" },
    { to: "/ai-activity", label: "AI activity" },
    { to: "/profile", label: "Profile" },
  ];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <Link className="text-lg font-bold tracking-tight" to="/">
            CommunityMesh
          </Link>
          <nav aria-label="Primary" className="flex flex-wrap gap-x-5 gap-y-2">
            {navigation.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `text-sm font-medium underline-offset-4 hover:underline ${
                    isActive ? "text-emerald-900 underline" : "text-stone-700"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="border-t border-stone-200 px-6 py-6 text-center text-sm text-stone-600">
        CommunityMesh is community-governed hosted infrastructure.
      </footer>
    </div>
  );
}

function HomePage() {
  return (
    <PageContent
      eyebrow="CommunityMesh"
      title="Build a stronger community, together."
      description="Find local resources, share what you can, and coordinate the work that helps neighbors thrive."
    >
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          className="rounded-lg bg-emerald-900 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
          to="/listings"
        >
          Browse listings
        </Link>
        <Link
          className="rounded-lg border border-stone-300 px-5 py-3 font-semibold text-stone-900 hover:bg-stone-100"
          to="/hub"
        >
          Choose a local hub
        </Link>
      </div>
      <p className="mt-8 text-sm text-stone-600">
        The application shell is available offline after its first visit.
      </p>
    </PageContent>
  );
}

function LocalHubPage() {
  return (
    <PageContent
      eyebrow="Local hub"
      title="Choose your community"
      description="Select a supported ZIP code or city to scope listings and community activity."
    />
  );
}

function ListingsPage() {
  return (
    <PageContent
      eyebrow="Community listings"
      title="Find or share local resources"
      description="Browse donations, events, jobs, free items, services, and mutual aid in your selected community."
    >
      <Link
        className="mt-8 inline-flex rounded-lg bg-emerald-900 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
        to="/listings/new"
      >
        Create a listing
      </Link>
    </PageContent>
  );
}

function ListingDetailPage() {
  return (
    <PageContent
      eyebrow="Listing"
      title="Listing details"
      description="Listing details will appear here when available."
    />
  );
}

function CreateListingPage() {
  return (
    <PageContent
      eyebrow="Community listings"
      title="Create a listing"
      description="Share an offer or need with your selected local community."
    />
  );
}

function ProfilePage() {
  return (
    <PageContent
      eyebrow="Your account"
      title="Member profile"
      description="Manage your profile and review platform-derived contribution history."
    />
  );
}

function TasksPage() {
  return (
    <PageContent
      eyebrow="Contribute"
      title="Community tasks"
      description="Find reviewable tasks and follow the status of your contributions."
    />
  );
}

function GovernancePage() {
  return (
    <PageContent
      eyebrow="Community decisions"
      title="DAO governance"
      description="Review proposals, voting rules, outcomes, and execution history."
    />
  );
}

function AiActivityPage() {
  return (
    <PageContent
      eyebrow="Automation"
      title="AI activity"
      description="Inspect bounded agent runs and their reviewable outcomes."
    />
  );
}

function NotFoundPage() {
  return (
    <PageContent
      eyebrow="Page not found"
      title="We couldn’t find that page"
      description="The address may be incorrect, or the destination may have moved."
    >
      <Link
        className="mt-8 inline-flex rounded-lg bg-emerald-900 px-5 py-3 font-semibold text-white hover:bg-emerald-800"
        to="/"
      >
        Return home
      </Link>
    </PageContent>
  );
}

export const appRoutes: RouteObject[] = [
  {
    id: "application",
    path: "/",
    element: <AppLayout />,
    children: [
      { id: "home", index: true, element: <HomePage /> },
      { id: "local-hub", path: "hub", element: <LocalHubPage /> },
      { id: "listings", path: "listings", element: <ListingsPage /> },
      {
        id: "listing-create",
        path: "listings/new",
        element: <CreateListingPage />,
      },
      {
        id: "listing-detail",
        path: "listings/:listingId",
        element: <ListingDetailPage />,
      },
      { id: "profile", path: "profile", element: <ProfilePage /> },
      { id: "tasks", path: "tasks", element: <TasksPage /> },
      { id: "governance", path: "governance", element: <GovernancePage /> },
      {
        id: "ai-activity",
        path: "ai-activity",
        element: <AiActivityPage />,
      },
      { id: "not-found", path: "*", element: <NotFoundPage /> },
    ],
  },
];

export function AppRoutes() {
  return useRoutes(appRoutes);
}
