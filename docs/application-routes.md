# Application routes and component hierarchy

The client is a React single-page application. `src/main.tsx` mounts the browser router; `src/app/routes.tsx` owns the route map and route-level components.

## Component hierarchy

```text
ApplicationRoot
└── RouterProvider
    └── AppLayout
        ├── SiteHeader
        │   ├── CommunityMesh home link
        │   └── Primary navigation
        ├── Main content
        │   └── Current route page
        └── SiteFooter
```

The initial route pages are lightweight destination shells. Feature tasks fill them with data and workflows without changing the route contract. Protected routes must request authentication at the relevant feature boundary; they must not imply access merely because a route can render.

## Route map

| Path | Destination | Initial behavior |
| --- | --- | --- |
| `/` | Home | Intro and links to local hub and listing search |
| `/hub` | Local hub | Destination for supported ZIP/city selection |
| `/listings` | Listing search | Destination for category/text search and listing results |
| `/listings/new` | Listing creation | Destination for authenticated listing creation |
| `/listings/:listingId` | Listing detail | Destination for one listing |
| `/profile` | Member profile | Destination for the signed-in member's profile |
| `/tasks` | Contributor tasks | Destination for task discovery and contribution history |
| `/governance` | DAO governance | Destination for proposals, voting, outcomes, and history |
| `/ai-activity` | AI activity | Destination for agent run status and outcomes |
| Any other path | Not found | Explains the unknown path and links back home |

`/listings/new` is a static route and takes precedence over the listing ID route. The app uses browser history for online navigation; the versioned service worker serves the cached application shell for offline navigations. If records for an offline route were not previously synchronized, the route remains available but its feature view must state that the data requires a connection.

## Validation

Run `npm test` for route navigation/not-found and PWA shell tests, `npm run build` for type checking and production output, and `npm run lint` for lint checks.
