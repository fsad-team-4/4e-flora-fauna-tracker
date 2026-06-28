# System Architecture Diagram - 4E Flora, Fauna & Estate Biodiversity Tracker

Group system architecture diagram showing the main components and how they
connect. Reflects what is built today (Member 3 - auth, resident reports,
uploads) plus the planned cloud services. Teammate modules (M1 Flora, M2 Fauna,
M4 Alerts) are additional routes/controllers within the same backend - marked as
placeholders.


```mermaid
graph TD
    User([User Browser])

    subgraph Frontend["Frontend - React + Vite + MUI (Vercel)"]
        UI["React App<br/>pages / components / contexts"]
        Axios["Axios instance (http.js)<br/>attaches Bearer JWT"]
        UI --> Axios
    end

    subgraph Backend["Backend - Node + Express (Render)"]
        Routes["Routes<br/>/api/auth, /api/reports, /api/uploads"]
        Middleware["Auth Middleware<br/>protect / restrictTo"]
        Controllers["Controllers<br/>request handling / logic"]
        Models["Models<br/>Sequelize ORM"]
        Routes --> Middleware
        Middleware --> Controllers
        Controllers --> Models
        %% M1 Flora (Shernell): add flora routes -> controllers -> models
        %% M2 Fauna (Renee): add fauna routes -> controllers -> models
        %% M4 Alerts (Angelyn): add alerts routes -> controllers -> models
    end

    DB[("SQLite (dev) /<br/>PostgreSQL - Neon (prod)")]
    Cloudinary["Cloudinary<br/>image storage"]
    Mailer["Nodemailer / Ethereal<br/>resolve notifications"]

    User --> UI
    Axios -->|"HTTPS REST - Bearer JWT"| Routes
    Models --> DB
    Controllers -->|"upload image"| Cloudinary
    Controllers -->|"send email"| Mailer

    %% Planned teammate services:
    %% M2 Fauna (Renee): Map API (e.g. Leaflet) for sighting locations
    %% M1 Flora / M4 Alerts: Generative AI provider (Gemini or Claude - TBC)
```

<!-- M1 Flora (Shernell): add flora feature routes/controllers/models in the backend; note any extra services -->
<!-- M2 Fauna (Renee): add fauna routes/controllers/models; add Map API (e.g. Leaflet) node + connection -->
<!-- M4 Alerts (Angelyn): add alerts routes/controllers/models; note GenAI service for weekly summary -->
<!-- Pending: confirm Generative AI provider (Gemini vs Claude) and add it as a service node once decided -->

## Notes

- The exported image (`architecture-diagram.png`) is generated from the Mermaid
  source above via [mermaid.live](https://mermaid.live). Re-export the PNG after
  adding teammate components so it stays in sync.
- Teammate modules (M1 Flora, M2 Fauna, M4 Alerts) are not separate services -
  they are additional feature routes -> controllers -> models inside the same
  Express backend, reusing the shared auth middleware and Sequelize/DB setup.
  Any new third-party services they introduce (e.g. a Map API for M2, a GenAI
  provider for M1/M4) should be added as nodes here.
- See `design/architecture.md` for the detailed folder-by-folder breakdown of
  the backend and frontend.
