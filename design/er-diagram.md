# Entity-Relationship Diagram - 4E Flora, Fauna & Estate Biodiversity Tracker

Group ER diagram covering the full system. All four modules have shipped, so
every entity below maps to a real Sequelize model in `backend/src/models/`.

```mermaid
erDiagram
    User ||--o{ ResidentReport : "files (reported_by)"
    ResidentReport ||--o{ CaseStatusLog : "has history"
    User ||--o{ CaseStatusLog : "makes changes (changed_by)"
    User ||--o{ ZoneAssignment : "is assigned blocks (user_id)"
    User ||--o{ GreeneryRecord : "records (recorded_by)"
    User ||--o{ FaunaSighting : "logs (reported_by)"
    User |o--o{ AlertRule : "creates (created_by, nullable)"
    AlertRule |o--o{ NotificationLog : "produces (rule_id, nullable)"

    %% ----------------------------------------------------------------
    %% M3 Resident Reports & Authentication (Klemens)
    %% ----------------------------------------------------------------
    User {
        int id PK
        string name
        string email UK
        string password_hash
        enum role "resident, welfare_partner, field_officer, manager"
    }

    ResidentReport {
        int id PK
        enum category "flora_health, community_cat, pigeon, pest, other"
        string title
        text description
        json photo_urls "array of URL strings"
        float gps_lat "nullable"
        float gps_lng "nullable"
        string block_number "nullable"
        string floor_level "nullable"
        enum status "open, in_progress, resolved"
        int reported_by FK
        boolean is_deleted "soft delete"
    }

    CaseStatusLog {
        int id PK
        int report_id FK
        string old_status
        string new_status
        int changed_by FK
    }

    ZoneAssignment {
        int id PK
        int user_id FK
        string block_number "one row per block a welfare partner covers"
    }

    %% ----------------------------------------------------------------
    %% M1 Flora (Shernell)
    %% ----------------------------------------------------------------
    GreeneryRecord {
        int id PK
        string species
        string common_name "nullable"
        string location_zone "nullable"
        float gps_lat "nullable"
        float gps_lng "nullable"
        string location "nullable"
        enum health_status "healthy, at_risk, critical"
        text health_notes "nullable"
        string plant_family "nullable"
        string site_suitability "nullable"
        string color "nullable"
        float max_height_at_maturity "nullable, metres"
        text care_recommendation "nullable, AI-generated"
        string image_url "nullable"
        boolean is_catalog_only "catalog entry, not a planted asset"
        datetime last_inspected_at "nullable"
        int recorded_by FK
        boolean is_deleted "soft delete"
    }

    %% ----------------------------------------------------------------
    %% M2 Fauna (Renee)
    %% ----------------------------------------------------------------
    FaunaSighting {
        int id PK
        enum species "cat, pigeon, crow, mynah, other"
        string block_number "nullable, groups under Unknown"
        string floor_level "nullable"
        json behaviour_tags "array of tag strings"
        float gps_lat "nullable"
        float gps_lng "nullable"
        string photo_url "nullable"
        text notes "nullable"
        enum status "open, in_progress, resolved"
        int reported_by FK
        boolean is_deleted "soft delete"
    }

    %% ----------------------------------------------------------------
    %% M4 Alerts (Angelyn)
    %% ----------------------------------------------------------------
    AlertRule {
        int id PK
        string name
        string trigger_type "flora_critical, fauna_hotspot, new_case_urgent, weekly_summary"
        int threshold "nullable"
        text recipients "comma-separated emails"
        string channel "email, sms, both"
        boolean is_active
        boolean is_deleted "soft delete"
        int created_by FK "nullable"
    }

    NotificationLog {
        int id PK
        int rule_id FK "nullable, null once the rule is deleted"
        string channel "nullable"
        text recipient "nullable"
        string status "nullable, sent or failed"
        text message_preview "nullable, first 200 chars"
    }

    MetricSnapshot {
        int id PK
        string snapshot_date UK "YYYY-MM-DD, one row per day"
        int open_cases
        int critical_flora
        int at_risk_flora
        int active_hotspots
        int total_sightings
        int risk_score
    }

    RodentAssessment {
        int id PK
        string block_number "nullable"
        string floor_level "nullable"
        text observations
        string risk_level "nullable, low/medium/high/critical"
        text likely_cause "nullable, AI-generated"
        json signs_identified "nullable, AI-generated array"
        json immediate_actions "nullable, AI-generated array"
        boolean escalate_to_contractor
        text escalation_reason "nullable"
        text follow_up_notes "nullable"
        int assessed_by "nullable, User.id - no association defined"
        boolean is_deleted "soft delete"
    }
```

## Notes

- The exported image (`er-diagram.png`) is generated from the Mermaid source
  above via [mermaid.live](https://mermaid.live). After changing the source,
  re-export the PNG so it stays in sync.
- Every entity maps directly to a Sequelize model in `backend/src/models/`, and
  the relationships above are the associations declared in
  `backend/src/models/index.js`. See `design/klemens/database-schema.md` for the
  full column-level schema of the M3 tables (`Users`, `ResidentReports`,
  `CaseStatusLogs`).
- `createdAt` and `updatedAt` are omitted from every entity block above. Every
  model uses the Sequelize default `timestamps: true`, so both columns exist on
  all tables.
- `MetricSnapshot` and `RodentAssessment` have no associations in
  `models/index.js`, so they are drawn unconnected. `RodentAssessment.assessed_by`
  holds a `User.id` but is a plain integer column with neither a `references`
  clause nor an association, so it is not marked FK.
- `AlertRule.created_by` and `NotificationLog.rule_id` are nullable, which is why
  those two relationships use the optional (zero-or-one) parent cardinality.
- Soft delete is a boolean flag, not a row deletion: `ResidentReport`,
  `GreeneryRecord`, `FaunaSighting`, `AlertRule` and `RodentAssessment` all carry
  `is_deleted`, and records with it set are hidden from lists but retained.
