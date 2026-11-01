export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          id: string;
          processed_at: string | null;
          requested_at: string;
          status: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          processed_at?: string | null;
          requested_at?: string;
          status?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          processed_at?: string | null;
          requested_at?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      achievements: {
        Row: {
          code: string;
          description: string | null;
          icon: string | null;
          id: string;
          is_active: boolean;
          name: string;
          rule: NonNullable<Json>;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          rule?: NonNullable<Json>;
          sort_order?: number;
        };
        Update: {
          code?: string;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          rule?: NonNullable<Json>;
          sort_order?: number;
        };
        Relationships: [];
      };
      admin_audit: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_type: Database["public"]["Enums"]["actor_type"];
          after_data: Json | null;
          before_data: Json | null;
          created_at: string;
          id: number;
          justification: string | null;
          resource_id: string | null;
          resource_type: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_type?: Database["public"]["Enums"]["actor_type"];
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          id?: never;
          justification?: string | null;
          resource_id?: string | null;
          resource_type: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_type?: Database["public"]["Enums"]["actor_type"];
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string;
          id?: never;
          justification?: string | null;
          resource_id?: string | null;
          resource_type?: string;
        };
        Relationships: [];
      };
      analytics_events: {
        Row: {
          anon_id: string | null;
          created_at: string;
          event_name: string;
          expires_at: string;
          id: number;
          locale: Database["public"]["Enums"]["locale_code"] | null;
          properties: NonNullable<Json>;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          anon_id?: string | null;
          created_at?: string;
          event_name: string;
          expires_at?: string;
          id?: never;
          locale?: Database["public"]["Enums"]["locale_code"] | null;
          properties?: NonNullable<Json>;
          user_id?: string | null;
        };
        Update: {
          anon_id?: string | null;
          created_at?: string;
          event_name?: string;
          expires_at?: string;
          id?: never;
          locale?: Database["public"]["Enums"]["locale_code"] | null;
          properties?: NonNullable<Json>;
          user_id?: string | null;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          description: string | null;
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          description?: string | null;
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value: NonNullable<Json>;
        };
        Update: {
          description?: string | null;
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      avatar_uploads: {
        Row: {
          bytes: number;
          created_at: string;
          deleted_at: string | null;
          id: string;
          mime: string;
          path: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          bytes: number;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          mime: string;
          path: string;
          user_id?: string | null;
        };
        Update: {
          bytes?: number;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          mime?: string;
          path?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      cart_items: {
        Row: {
          added_at: string;
          cart_id: string;
          product_id: string;
          quantity: number;
        };
        ComputedFields: never;
        Insert: {
          added_at?: string;
          cart_id: string;
          product_id: string;
          quantity: number;
        };
        Update: {
          added_at?: string;
          cart_id?: string;
          product_id?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey";
            columns: ["cart_id"];
            isOneToOne: false;
            referencedRelation: "carts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cart_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      carts: {
        Row: {
          id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      certificates: {
        Row: {
          code: string;
          enrollment_id: string;
          id: string;
          issued_at: string;
          program_id: string;
          revoked_at: string | null;
          snapshot: NonNullable<Json>;
          user_id: string;
          version_id: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          enrollment_id: string;
          id?: string;
          issued_at?: string;
          program_id: string;
          revoked_at?: string | null;
          snapshot: NonNullable<Json>;
          user_id: string;
          version_id: string;
        };
        Update: {
          code?: string;
          enrollment_id?: string;
          id?: string;
          issued_at?: string;
          program_id?: string;
          revoked_at?: string | null;
          snapshot?: NonNullable<Json>;
          user_id?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "certificates_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: true;
            referencedRelation: "enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "certificates_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "program_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      collectible_bid_owners: {
        Row: {
          bid_id: string;
          collectible_id: string;
          created_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          bid_id: string;
          collectible_id: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          bid_id?: string;
          collectible_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collectible_bid_owners_bid_id_fkey";
            columns: ["bid_id"];
            isOneToOne: true;
            referencedRelation: "collectible_bids";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collectible_bid_owners_collectible_id_fkey";
            columns: ["collectible_id"];
            isOneToOne: false;
            referencedRelation: "collectibles";
            referencedColumns: ["id"];
          },
        ];
      };
      collectible_bids: {
        Row: {
          amount_cents: number;
          bidder_label: string | null;
          collectible_id: string;
          created_at: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          bidder_label?: string | null;
          collectible_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          amount_cents?: number;
          bidder_label?: string | null;
          collectible_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collectible_bids_collectible_id_fkey";
            columns: ["collectible_id"];
            isOneToOne: false;
            referencedRelation: "collectibles";
            referencedColumns: ["id"];
          },
        ];
      };
      collectible_results: {
        Row: {
          collectible_id: string;
          contact_status: string;
          contact_updated_at: string | null;
          final_cents: number;
          finalized_at: string;
          outcome: string;
          winner_user_id: string | null;
          winning_bid_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          collectible_id: string;
          contact_status?: string;
          contact_updated_at?: string | null;
          final_cents: number;
          finalized_at?: string;
          outcome: string;
          winner_user_id?: string | null;
          winning_bid_id?: string | null;
        };
        Update: {
          collectible_id?: string;
          contact_status?: string;
          contact_updated_at?: string | null;
          final_cents?: number;
          finalized_at?: string;
          outcome?: string;
          winner_user_id?: string | null;
          winning_bid_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "collectible_results_collectible_id_fkey";
            columns: ["collectible_id"];
            isOneToOne: true;
            referencedRelation: "collectibles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collectible_results_winning_bid_id_fkey";
            columns: ["winning_bid_id"];
            isOneToOne: false;
            referencedRelation: "collectible_bids";
            referencedColumns: ["id"];
          },
        ];
      };
      collectibles: {
        Row: {
          authenticity_note: string;
          bid_increments_cents: number[];
          bids_count: number;
          cancelled_at: string | null;
          created_at: string;
          creator_id: string | null;
          current_cents: number;
          description: string;
          duration_minutes: number;
          ends_at: string | null;
          extensions_count: number;
          finalized_at: string | null;
          id: string;
          is_demo: boolean;
          leading_bid_id: string | null;
          photos: string[];
          start_price_cents: number;
          starts_at: string | null;
          status: string;
          title: string;
          updated_at: string;
          winner_label: string | null;
        };
        ComputedFields: never;
        Insert: {
          authenticity_note?: string;
          bid_increments_cents?: number[];
          bids_count?: number;
          cancelled_at?: string | null;
          created_at?: string;
          creator_id?: string | null;
          current_cents: number;
          description?: string;
          duration_minutes?: number;
          ends_at?: string | null;
          extensions_count?: number;
          finalized_at?: string | null;
          id?: string;
          is_demo?: boolean;
          leading_bid_id?: string | null;
          photos?: string[];
          start_price_cents: number;
          starts_at?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
          winner_label?: string | null;
        };
        Update: {
          authenticity_note?: string;
          bid_increments_cents?: number[];
          bids_count?: number;
          cancelled_at?: string | null;
          created_at?: string;
          creator_id?: string | null;
          current_cents?: number;
          description?: string;
          duration_minutes?: number;
          ends_at?: string | null;
          extensions_count?: number;
          finalized_at?: string | null;
          id?: string;
          is_demo?: boolean;
          leading_bid_id?: string | null;
          photos?: string[];
          start_price_cents?: number;
          starts_at?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
          winner_label?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "collectibles_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collectibles_leading_bid_fkey";
            columns: ["leading_bid_id"];
            isOneToOne: false;
            referencedRelation: "collectible_bids";
            referencedColumns: ["id"];
          },
        ];
      };
      completions: {
        Row: {
          completed_at: string;
          content_id: string;
          id: string;
          local_date: string;
          source: string;
          timezone: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string;
          content_id: string;
          id?: string;
          local_date: string;
          source?: string;
          timezone: string;
          user_id: string;
        };
        Update: {
          completed_at?: string;
          content_id?: string;
          id?: string;
          local_date?: string;
          source?: string;
          timezone?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "completions_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      content: {
        Row: {
          access_level: Database["public"]["Enums"]["access_level"] | null;
          archived_at: string | null;
          archived_by: string | null;
          completion_mode:
            | Database["public"]["Enums"]["completion_mode"]
            | null;
          cover_url: string | null;
          created_at: string;
          created_by: string | null;
          creator_id: string | null;
          creator_link_origin: string | null;
          difficulty: string | null;
          disclaimer_kind: string | null;
          duration_minutes: number | null;
          featured_rank: number | null;
          has_captions: boolean;
          id: string;
          is_featured: boolean;
          media_credit: string | null;
          media_license_kind: string;
          media_license_ref: string | null;
          pillar: Database["public"]["Enums"]["pillar"];
          publish_at: string | null;
          published_at: string | null;
          required_module_id: string | null;
          review_status: Database["public"]["Enums"]["review_status"];
          search: unknown;
          slug: string;
          source_locale: Database["public"]["Enums"]["locale_code"];
          status: Database["public"]["Enums"]["content_status"];
          summary: string | null;
          tags: string[];
          title: string;
          type: Database["public"]["Enums"]["content_type"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          access_level?: Database["public"]["Enums"]["access_level"] | null;
          archived_at?: string | null;
          archived_by?: string | null;
          completion_mode?:
            | Database["public"]["Enums"]["completion_mode"]
            | null;
          cover_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          creator_id?: string | null;
          creator_link_origin?: string | null;
          difficulty?: string | null;
          disclaimer_kind?: string | null;
          duration_minutes?: number | null;
          featured_rank?: number | null;
          has_captions?: boolean;
          id?: string;
          is_featured?: boolean;
          media_credit?: string | null;
          media_license_kind?: string;
          media_license_ref?: string | null;
          pillar: Database["public"]["Enums"]["pillar"];
          publish_at?: string | null;
          published_at?: string | null;
          required_module_id?: string | null;
          review_status?: Database["public"]["Enums"]["review_status"];
          search?: never;
          slug: string;
          source_locale?: Database["public"]["Enums"]["locale_code"];
          status?: Database["public"]["Enums"]["content_status"];
          summary?: string | null;
          tags?: string[];
          title: string;
          type: Database["public"]["Enums"]["content_type"];
          updated_at?: string;
        };
        Update: {
          access_level?: Database["public"]["Enums"]["access_level"] | null;
          archived_at?: string | null;
          archived_by?: string | null;
          completion_mode?:
            | Database["public"]["Enums"]["completion_mode"]
            | null;
          cover_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          creator_id?: string | null;
          creator_link_origin?: string | null;
          difficulty?: string | null;
          disclaimer_kind?: string | null;
          duration_minutes?: number | null;
          featured_rank?: number | null;
          has_captions?: boolean;
          id?: string;
          is_featured?: boolean;
          media_credit?: string | null;
          media_license_kind?: string;
          media_license_ref?: string | null;
          pillar?: Database["public"]["Enums"]["pillar"];
          publish_at?: string | null;
          published_at?: string | null;
          required_module_id?: string | null;
          review_status?: Database["public"]["Enums"]["review_status"];
          search?: never;
          slug?: string;
          source_locale?: Database["public"]["Enums"]["locale_code"];
          status?: Database["public"]["Enums"]["content_status"];
          summary?: string | null;
          tags?: string[];
          title?: string;
          type?: Database["public"]["Enums"]["content_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_required_module_id_fkey";
            columns: ["required_module_id"];
            isOneToOne: false;
            referencedRelation: "plan_modules";
            referencedColumns: ["id"];
          },
        ];
      };
      content_bodies: {
        Row: {
          body: NonNullable<Json>;
          captions_url: string | null;
          content_id: string;
          media_provider: Database["public"]["Enums"]["media_provider"];
          media_ref: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          body?: NonNullable<Json>;
          captions_url?: string | null;
          content_id: string;
          media_provider?: Database["public"]["Enums"]["media_provider"];
          media_ref?: string | null;
          updated_at?: string;
        };
        Update: {
          body?: NonNullable<Json>;
          captions_url?: string | null;
          content_id?: string;
          media_provider?: Database["public"]["Enums"]["media_provider"];
          media_ref?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_bodies_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: true;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      content_localizations: {
        Row: {
          body: Json | null;
          content_id: string;
          locale: Database["public"]["Enums"]["locale_code"];
          status: string;
          summary: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          body?: Json | null;
          content_id: string;
          locale: Database["public"]["Enums"]["locale_code"];
          status?: string;
          summary?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          body?: Json | null;
          content_id?: string;
          locale?: Database["public"]["Enums"]["locale_code"];
          status?: string;
          summary?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "content_localizations_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      content_product_links: {
        Row: {
          admin_note: string | null;
          content_id: string;
          created_at: string;
          id: string;
          note: string | null;
          product_id: string;
          product_version_at_validation: number | null;
          status: Database["public"]["Enums"]["link_status"];
          suggested_by: string | null;
          suggested_by_creator: string | null;
          suspended_reason: string | null;
          updated_at: string;
          validated_at: string | null;
          validated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          admin_note?: string | null;
          content_id: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          product_id: string;
          product_version_at_validation?: number | null;
          status?: Database["public"]["Enums"]["link_status"];
          suggested_by?: string | null;
          suggested_by_creator?: string | null;
          suspended_reason?: string | null;
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Update: {
          admin_note?: string | null;
          content_id?: string;
          created_at?: string;
          id?: string;
          note?: string | null;
          product_id?: string;
          product_version_at_validation?: number | null;
          status?: Database["public"]["Enums"]["link_status"];
          suggested_by?: string | null;
          suggested_by_creator?: string | null;
          suspended_reason?: string | null;
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "content_product_links_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_product_links_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_product_links_suggested_by_creator_fkey";
            columns: ["suggested_by_creator"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      content_progress: {
        Row: {
          content_id: string;
          position_seconds: number;
          progress_pct: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          content_id: string;
          position_seconds?: number;
          progress_pct?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content_id?: string;
          position_seconds?: number;
          progress_pct?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_progress_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      content_reviews: {
        Row: {
          content_id: string;
          decided_at: string | null;
          decided_by: string | null;
          decision: Database["public"]["Enums"]["review_status"];
          feedback: string | null;
          id: string;
          requested_publish_at: string | null;
          round: number;
          submitted_at: string;
          submitted_by: string | null;
          version_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          content_id: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision?: Database["public"]["Enums"]["review_status"];
          feedback?: string | null;
          id?: string;
          requested_publish_at?: string | null;
          round?: number;
          submitted_at?: string;
          submitted_by?: string | null;
          version_id?: string | null;
        };
        Update: {
          content_id?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision?: Database["public"]["Enums"]["review_status"];
          feedback?: string | null;
          id?: string;
          requested_publish_at?: string | null;
          round?: number;
          submitted_at?: string;
          submitted_by?: string | null;
          version_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "content_reviews_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_reviews_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "recipe_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      content_type_settings: {
        Row: {
          auto_threshold_pct: number;
          default_completion_mode: Database["public"]["Enums"]["completion_mode"];
          review_required: boolean;
          type: Database["public"]["Enums"]["content_type"];
        };
        ComputedFields: never;
        Insert: {
          auto_threshold_pct?: number;
          default_completion_mode?: Database["public"]["Enums"]["completion_mode"];
          review_required?: boolean;
          type: Database["public"]["Enums"]["content_type"];
        };
        Update: {
          auto_threshold_pct?: number;
          default_completion_mode?: Database["public"]["Enums"]["completion_mode"];
          review_required?: boolean;
          type?: Database["public"]["Enums"]["content_type"];
        };
        Relationships: [];
      };
      creator_category_links: {
        Row: {
          category_id: string;
          created_at: string;
          creator_id: string;
          position: number;
        };
        ComputedFields: never;
        Insert: {
          category_id: string;
          created_at?: string;
          creator_id: string;
          position: number;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          creator_id?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "creator_category_links_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "hero_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "creator_category_links_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      creator_credentials_requests: {
        Row: {
          creator_id: string;
          decided_at: string | null;
          decision: string | null;
          text: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          creator_id: string;
          decided_at?: string | null;
          decision?: string | null;
          text: string;
          updated_at?: string;
        };
        Update: {
          creator_id?: string;
          decided_at?: string | null;
          decision?: string | null;
          text?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "creator_credentials_requests_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: true;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      creator_follower_counts: {
        Row: {
          creator_id: string;
          followers: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          creator_id: string;
          followers?: number;
          updated_at?: string;
        };
        Update: {
          creator_id?: string;
          followers?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "creator_follower_counts_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: true;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      creator_library_overrides: {
        Row: {
          created_at: string;
          creator_id: string;
          icon: string | null;
          is_visible: boolean | null;
          label: Json | null;
          sort_order: number | null;
          source_key: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          creator_id: string;
          icon?: string | null;
          is_visible?: boolean | null;
          label?: Json | null;
          sort_order?: number | null;
          source_key: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          icon?: string | null;
          is_visible?: boolean | null;
          label?: Json | null;
          sort_order?: number | null;
          source_key?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "creator_library_overrides_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      creator_products: {
        Row: {
          created_at: string;
          created_by: string | null;
          creator_id: string;
          id: string;
          note: string | null;
          product_id: string;
          sort_order: number;
          status: Database["public"]["Enums"]["link_status"];
          updated_at: string;
          validated_at: string | null;
          validated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          creator_id: string;
          id?: string;
          note?: string | null;
          product_id: string;
          sort_order?: number;
          status?: Database["public"]["Enums"]["link_status"];
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          creator_id?: string;
          id?: string;
          note?: string | null;
          product_id?: string;
          sort_order?: number;
          status?: Database["public"]["Enums"]["link_status"];
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "creator_products_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "creator_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      creator_profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          cover_url: string | null;
          created_at: string;
          credentials: string | null;
          credentials_approved_at: string | null;
          headline: string | null;
          id: string;
          is_fictional: boolean;
          name: string;
          pillars: Database["public"]["Enums"]["pillar"][];
          rights_holder: string | null;
          rights_note: string | null;
          rights_status: string;
          rights_valid_until: string | null;
          slug: string;
          socials: NonNullable<Json>;
          sort_order: number;
          specialties: string[];
          status: Database["public"]["Enums"]["partner_status"];
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          cover_url?: string | null;
          created_at?: string;
          credentials?: string | null;
          credentials_approved_at?: string | null;
          headline?: string | null;
          id?: string;
          is_fictional?: boolean;
          name: string;
          pillars?: Database["public"]["Enums"]["pillar"][];
          rights_holder?: string | null;
          rights_note?: string | null;
          rights_status?: string;
          rights_valid_until?: string | null;
          slug: string;
          socials?: NonNullable<Json>;
          sort_order?: number;
          specialties?: string[];
          status?: Database["public"]["Enums"]["partner_status"];
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          cover_url?: string | null;
          created_at?: string;
          credentials?: string | null;
          credentials_approved_at?: string | null;
          headline?: string | null;
          id?: string;
          is_fictional?: boolean;
          name?: string;
          pillars?: Database["public"]["Enums"]["pillar"][];
          rights_holder?: string | null;
          rights_note?: string | null;
          rights_status?: string;
          rights_valid_until?: string | null;
          slug?: string;
          socials?: NonNullable<Json>;
          sort_order?: number;
          specialties?: string[];
          status?: Database["public"]["Enums"]["partner_status"];
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      creator_recipe_links: {
        Row: {
          content_id: string;
          created_at: string;
          created_by: string | null;
          creator_id: string;
          id: string;
          sort_order: number;
          status: Database["public"]["Enums"]["link_status"];
          updated_at: string;
          validated_at: string | null;
          validated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          content_id: string;
          created_at?: string;
          created_by?: string | null;
          creator_id: string;
          id?: string;
          sort_order?: number;
          status?: Database["public"]["Enums"]["link_status"];
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Update: {
          content_id?: string;
          created_at?: string;
          created_by?: string | null;
          creator_id?: string;
          id?: string;
          sort_order?: number;
          status?: Database["public"]["Enums"]["link_status"];
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "creator_recipe_links_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "creator_recipe_links_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      creator_reference_metrics: {
        Row: {
          created_at: string;
          creator_id: string;
          metric_key: string;
          source: string;
          unit: string;
          updated_at: string;
          updated_by: string | null;
          value: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          creator_id: string;
          metric_key: string;
          source?: string;
          unit: string;
          updated_at?: string;
          updated_by?: string | null;
          value: number;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          metric_key?: string;
          source?: string;
          unit?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "creator_reference_metrics_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      creator_rights_private: {
        Row: {
          creator_id: string;
          document_ref: string | null;
          notes: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          creator_id: string;
          document_ref?: string | null;
          notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          updated_at?: string;
        };
        Update: {
          creator_id?: string;
          document_ref?: string | null;
          notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "creator_rights_private_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: true;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      custom_lists: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      demo_destinations: {
        Row: {
          code: string;
          description: Json | null;
          id: string;
          is_active: boolean;
          name: NonNullable<Json>;
          sort_order: number;
          zone: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          description?: Json | null;
          id?: string;
          is_active?: boolean;
          name: NonNullable<Json>;
          sort_order?: number;
          zone: string;
        };
        Update: {
          code?: string;
          description?: Json | null;
          id?: string;
          is_active?: boolean;
          name?: NonNullable<Json>;
          sort_order?: number;
          zone?: string;
        };
        Relationships: [];
      };
      demo_shipping_rules: {
        Row: {
          base_cents: number;
          eta_days_max: number;
          eta_days_min: number;
          free_over_cents: number | null;
          per_seller_cents: number;
          zone: string;
        };
        ComputedFields: never;
        Insert: {
          base_cents: number;
          eta_days_max?: number;
          eta_days_min?: number;
          free_over_cents?: number | null;
          per_seller_cents?: number;
          zone: string;
        };
        Update: {
          base_cents?: number;
          eta_days_max?: number;
          eta_days_min?: number;
          free_over_cents?: number | null;
          per_seller_cents?: number;
          zone?: string;
        };
        Relationships: [];
      };
      enrollments: {
        Row: {
          completed_at: string | null;
          enrolled_at: string;
          id: string;
          program_id: string;
          status: Database["public"]["Enums"]["enrollment_status"];
          user_id: string;
          version_id: string;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string | null;
          enrolled_at?: string;
          id?: string;
          program_id: string;
          status?: Database["public"]["Enums"]["enrollment_status"];
          user_id: string;
          version_id: string;
        };
        Update: {
          completed_at?: string | null;
          enrolled_at?: string;
          id?: string;
          program_id?: string;
          status?: Database["public"]["Enums"]["enrollment_status"];
          user_id?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enrollments_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "program_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      favorites: {
        Row: {
          content_id: string | null;
          created_at: string;
          id: string;
          item_type: string | null;
          product_id: string | null;
          program_id: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          content_id?: string | null;
          created_at?: string;
          id?: string;
          item_type?: never;
          product_id?: string | null;
          program_id?: string | null;
          user_id: string;
        };
        Update: {
          content_id?: string | null;
          created_at?: string;
          id?: string;
          item_type?: never;
          product_id?: string | null;
          program_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorites_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorites_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          admin_note: string | null;
          assignee: string | null;
          category: string;
          context: string;
          created_at: string;
          id: string;
          locale: Database["public"]["Enums"]["locale_code"] | null;
          message: string | null;
          priority: string | null;
          rating: number | null;
          status: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          admin_note?: string | null;
          assignee?: string | null;
          category?: string;
          context: string;
          created_at?: string;
          id?: string;
          locale?: Database["public"]["Enums"]["locale_code"] | null;
          message?: string | null;
          priority?: string | null;
          rating?: number | null;
          status?: string;
          user_id?: string | null;
        };
        Update: {
          admin_note?: string | null;
          assignee?: string | null;
          category?: string;
          context?: string;
          created_at?: string;
          id?: string;
          locale?: Database["public"]["Enums"]["locale_code"] | null;
          message?: string | null;
          priority?: string | null;
          rating?: number | null;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      fulfillment_events: {
        Row: {
          actor_id: string | null;
          actor_type: Database["public"]["Enums"]["actor_type"];
          created_at: string;
          from_status: Database["public"]["Enums"]["fulfillment_status"] | null;
          fulfillment_id: string;
          id: number;
          note: string | null;
          to_status: Database["public"]["Enums"]["fulfillment_status"];
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          actor_type: Database["public"]["Enums"]["actor_type"];
          created_at?: string;
          from_status?:
            | Database["public"]["Enums"]["fulfillment_status"]
            | null;
          fulfillment_id: string;
          id?: never;
          note?: string | null;
          to_status: Database["public"]["Enums"]["fulfillment_status"];
        };
        Update: {
          actor_id?: string | null;
          actor_type?: Database["public"]["Enums"]["actor_type"];
          created_at?: string;
          from_status?:
            | Database["public"]["Enums"]["fulfillment_status"]
            | null;
          fulfillment_id?: string;
          id?: never;
          note?: string | null;
          to_status?: Database["public"]["Enums"]["fulfillment_status"];
        };
        Relationships: [
          {
            foreignKeyName: "fulfillment_events_fulfillment_id_fkey";
            columns: ["fulfillment_id"];
            isOneToOne: false;
            referencedRelation: "test_fulfillments";
            referencedColumns: ["id"];
          },
        ];
      };
      hero_categories: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: NonNullable<Json>;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: NonNullable<Json>;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: NonNullable<Json>;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      hero_library_tabs: {
        Row: {
          category_id: string;
          created_at: string;
          icon: string | null;
          is_visible: boolean;
          label: Json | null;
          sort_order: number;
          source_key: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          category_id: string;
          created_at?: string;
          icon?: string | null;
          is_visible?: boolean;
          label?: Json | null;
          sort_order?: number;
          source_key: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          icon?: string | null;
          is_visible?: boolean;
          label?: Json | null;
          sort_order?: number;
          source_key?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hero_library_tabs_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "hero_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      hero_cover_uploads: {
        Row: {
          bytes: number;
          created_at: string;
          deleted_at: string | null;
          id: string;
          mime: string;
          path: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          bytes: number;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          mime: string;
          path: string;
          user_id?: string | null;
        };
        Update: {
          bytes?: number;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          mime?: string;
          path?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      hero_favorites: {
        Row: {
          created_at: string;
          creator_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          creator_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hero_favorites_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      interest_tags: {
        Row: {
          label: NonNullable<Json>;
          pillar: Database["public"]["Enums"]["pillar"] | null;
          sort_order: number;
          tag: string;
        };
        ComputedFields: never;
        Insert: {
          label: NonNullable<Json>;
          pillar?: Database["public"]["Enums"]["pillar"] | null;
          sort_order?: number;
          tag: string;
        };
        Update: {
          label?: NonNullable<Json>;
          pillar?: Database["public"]["Enums"]["pillar"] | null;
          sort_order?: number;
          tag?: string;
        };
        Relationships: [];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          agency_id: string | null;
          brand_id: string | null;
          created_at: string;
          created_by: string | null;
          creator_profile_id: string | null;
          email: string;
          expires_at: string;
          id: string;
          member_role: string | null;
          professional_id: string | null;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["app_role"];
          seller_org_id: string | null;
          status: Database["public"]["Enums"]["invitation_status"];
          talent_id: string | null;
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          agency_id?: string | null;
          brand_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          creator_profile_id?: string | null;
          email: string;
          expires_at: string;
          id?: string;
          member_role?: string | null;
          professional_id?: string | null;
          revoked_at?: string | null;
          role: Database["public"]["Enums"]["app_role"];
          seller_org_id?: string | null;
          status?: Database["public"]["Enums"]["invitation_status"];
          talent_id?: string | null;
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          agency_id?: string | null;
          brand_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          creator_profile_id?: string | null;
          email?: string;
          expires_at?: string;
          id?: string;
          member_role?: string | null;
          professional_id?: string | null;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          seller_org_id?: string | null;
          status?: Database["public"]["Enums"]["invitation_status"];
          talent_id?: string | null;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_brand_fk";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_creator_profile_id_fkey";
            columns: ["creator_profile_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_seller_org_id_fkey";
            columns: ["seller_org_id"];
            isOneToOne: false;
            referencedRelation: "seller_organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      list_items: {
        Row: {
          added_at: string;
          content_id: string | null;
          id: string;
          item_type: string | null;
          list_id: string;
          position: number;
          product_id: string | null;
          program_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          added_at?: string;
          content_id?: string | null;
          id?: string;
          item_type?: never;
          list_id: string;
          position?: number;
          product_id?: string | null;
          program_id?: string | null;
        };
        Update: {
          added_at?: string;
          content_id?: string | null;
          id?: string;
          item_type?: never;
          list_id?: string;
          position?: number;
          product_id?: string | null;
          program_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "list_items_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "list_items_list_id_fkey";
            columns: ["list_id"];
            isOneToOne: false;
            referencedRelation: "custom_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "list_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "list_items_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      module_dependencies: {
        Row: {
          module_id: string;
          requires_module_id: string;
        };
        ComputedFields: never;
        Insert: {
          module_id: string;
          requires_module_id: string;
        };
        Update: {
          module_id?: string;
          requires_module_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "module_dependencies_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "plan_modules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "module_dependencies_requires_module_id_fkey";
            columns: ["requires_module_id"];
            isOneToOne: false;
            referencedRelation: "plan_modules";
            referencedColumns: ["id"];
          },
        ];
      };
      not_interested: {
        Row: {
          content_id: string;
          created_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          content_id: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          content_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "not_interested_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_preferences: {
        Row: {
          achievements: boolean;
          auction_outbid: boolean;
          channel_email: boolean;
          channel_push: boolean;
          commerce_updates: boolean;
          editorial_digest: boolean;
          hero_posts: boolean;
          office_updates: boolean;
          streak_reminders: boolean;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          achievements?: boolean;
          auction_outbid?: boolean;
          channel_email?: boolean;
          channel_push?: boolean;
          commerce_updates?: boolean;
          editorial_digest?: boolean;
          hero_posts?: boolean;
          office_updates?: boolean;
          streak_reminders?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          achievements?: boolean;
          auction_outbid?: boolean;
          channel_email?: boolean;
          channel_push?: boolean;
          commerce_updates?: boolean;
          editorial_digest?: boolean;
          hero_posts?: boolean;
          office_updates?: boolean;
          streak_reminders?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      plan_bundle_modules: {
        Row: {
          module_id: string;
          plan_id: string;
        };
        ComputedFields: never;
        Insert: {
          module_id: string;
          plan_id: string;
        };
        Update: {
          module_id?: string;
          plan_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_bundle_modules_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "plan_modules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_bundle_modules_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_modules: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          price_cents_demo: number;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          price_cents_demo?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          price_cents_demo?: number;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          is_free: boolean;
          name: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_free?: boolean;
          name: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_free?: boolean;
          name?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      post_photo_uploads: {
        Row: {
          bytes: number;
          created_at: string;
          deleted_at: string | null;
          id: string;
          mime: string;
          path: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          bytes: number;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          mime: string;
          path: string;
          user_id?: string | null;
        };
        Update: {
          bytes?: number;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          mime?: string;
          path?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      product_categories: {
        Row: {
          code: string;
          id: string;
          is_food: boolean;
          kind: string;
          name: NonNullable<Json>;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          id?: string;
          is_food?: boolean;
          kind: string;
          name: NonNullable<Json>;
          sort_order?: number;
        };
        Update: {
          code?: string;
          id?: string;
          is_food?: boolean;
          kind?: string;
          name?: NonNullable<Json>;
          sort_order?: number;
        };
        Relationships: [];
      };
      product_interest: {
        Row: {
          created_at: string;
          id: number;
          product_id: string;
          source: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: never;
          product_id: string;
          source: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: never;
          product_id?: string;
          source?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_interest_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_moderation: {
        Row: {
          action: string;
          admin_id: string | null;
          created_at: string;
          id: string;
          product_id: string;
          reason: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          admin_id?: string | null;
          created_at?: string;
          id?: string;
          product_id: string;
          reason?: string | null;
        };
        Update: {
          action?: string;
          admin_id?: string | null;
          created_at?: string;
          id?: string;
          product_id?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "product_moderation_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_versions: {
        Row: {
          changed_by: string | null;
          changed_fields: string[];
          created_at: string;
          id: string;
          product_id: string;
          significant: boolean;
          snapshot: NonNullable<Json>;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          changed_by?: string | null;
          changed_fields?: string[];
          created_at?: string;
          id?: string;
          product_id: string;
          significant?: boolean;
          snapshot: NonNullable<Json>;
          version: number;
        };
        Update: {
          changed_by?: string | null;
          changed_fields?: string[];
          created_at?: string;
          id?: string;
          product_id?: string;
          significant?: boolean;
          snapshot?: NonNullable<Json>;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_versions_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      professionals: {
        Row: {
          approved_at: string | null;
          bio: string;
          cities: string[];
          created_at: string;
          id: string;
          is_demo: boolean;
          name: string;
          online: boolean;
          photo_url: string | null;
          registry_number: string;
          registry_type: string;
          registry_uf: string;
          registry_verified: boolean;
          slug: string;
          sort_order: number;
          specialty: string;
          status: string;
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          bio?: string;
          cities?: string[];
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          name: string;
          online?: boolean;
          photo_url?: string | null;
          registry_number: string;
          registry_type: string;
          registry_uf: string;
          registry_verified?: boolean;
          slug: string;
          sort_order?: number;
          specialty: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          approved_at?: string | null;
          bio?: string;
          cities?: string[];
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          name?: string;
          online?: boolean;
          photo_url?: string | null;
          registry_number?: string;
          registry_type?: string;
          registry_uf?: string;
          registry_verified?: boolean;
          slug?: string;
          sort_order?: number;
          specialty?: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      professional_verifications: {
        Row: {
          note: string;
          professional_id: string;
          updated_at: string;
          verified_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          note?: string;
          professional_id: string;
          updated_at?: string;
          verified_by?: string | null;
        };
        Update: {
          note?: string;
          professional_id?: string;
          updated_at?: string;
          verified_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "professional_verifications_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: true;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
        ];
      };
      professional_services: {
        Row: {
          admin_disabled: boolean;
          created_at: string;
          description: string;
          duration_minutes: number | null;
          id: string;
          is_active: boolean;
          kind: string;
          mode: string;
          plan_weeks: number | null;
          price_cents: number;
          professional_id: string;
          sort_order: number;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          admin_disabled?: boolean;
          created_at?: string;
          description?: string;
          duration_minutes?: number | null;
          id?: string;
          is_active?: boolean;
          kind: string;
          mode: string;
          plan_weeks?: number | null;
          price_cents: number;
          professional_id: string;
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          admin_disabled?: boolean;
          created_at?: string;
          description?: string;
          duration_minutes?: number | null;
          id?: string;
          is_active?: boolean;
          kind?: string;
          mode?: string;
          plan_weeks?: number | null;
          price_cents?: number;
          professional_id?: string;
          sort_order?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "professional_services_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
        ];
      };
      professional_suggestions: {
        Row: {
          content_id: string | null;
          created_at: string;
          created_by: string | null;
          creator_id: string | null;
          id: string;
          professional_id: string;
          program_id: string | null;
          service_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          content_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          creator_id?: string | null;
          id?: string;
          professional_id: string;
          program_id?: string | null;
          service_id?: string | null;
        };
        Update: {
          content_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          creator_id?: string | null;
          id?: string;
          professional_id?: string;
          program_id?: string | null;
          service_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "professional_suggestions_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professional_suggestions_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professional_suggestions_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professional_suggestions_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "professional_suggestions_service_fk";
            columns: ["service_id", "professional_id"];
            isOneToOne: false;
            referencedRelation: "professional_services";
            referencedColumns: ["id", "professional_id"];
          },
        ];
      };
      professional_tap_counters: {
        Row: {
          action: string;
          count: number;
          creator_id: string | null;
          day: string;
          id: number;
          professional_id: string;
          source: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          count?: number;
          creator_id?: string | null;
          day: string;
          id?: number;
          professional_id: string;
          source: string;
          updated_at?: string;
        };
        Update: {
          action?: string;
          count?: number;
          creator_id?: string | null;
          day?: string;
          id?: number;
          professional_id?: string;
          source?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      service_cart_items: {
        Row: {
          added_at: string;
          id: string;
          price_cents_seen: number;
          service_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          added_at?: string;
          id?: string;
          price_cents_seen: number;
          service_id: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          id?: string;
          price_cents_seen?: number;
          service_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_cart_items_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "professional_services";
            referencedColumns: ["id"];
          },
        ];
      };
      service_orders: {
        Row: {
          client_label: string;
          closed_at: string | null;
          created_at: string;
          duration_minutes_snapshot: number | null;
          first_response_at: string | null;
          id: string;
          is_demo: boolean;
          kind_snapshot: string;
          mode_snapshot: string;
          plan_weeks_snapshot: number | null;
          price_cents: number;
          professional_id: string;
          schedule_note: string;
          service_id: string | null;
          status: string;
          title_snapshot: string;
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          client_label?: string;
          closed_at?: string | null;
          created_at?: string;
          duration_minutes_snapshot?: number | null;
          first_response_at?: string | null;
          id?: string;
          is_demo?: boolean;
          kind_snapshot: string;
          mode_snapshot: string;
          plan_weeks_snapshot?: number | null;
          price_cents: number;
          professional_id: string;
          schedule_note?: string;
          service_id?: string | null;
          status?: string;
          title_snapshot: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          client_label?: string;
          closed_at?: string | null;
          created_at?: string;
          duration_minutes_snapshot?: number | null;
          first_response_at?: string | null;
          id?: string;
          is_demo?: boolean;
          kind_snapshot?: string;
          mode_snapshot?: string;
          plan_weeks_snapshot?: number | null;
          price_cents?: number;
          professional_id?: string;
          schedule_note?: string;
          service_id?: string | null;
          status?: string;
          title_snapshot?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_orders_professional_id_fkey";
            columns: ["professional_id"];
            isOneToOne: false;
            referencedRelation: "professionals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_orders_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "professional_services";
            referencedColumns: ["id"];
          },
        ];
      };
      service_order_events: {
        Row: {
          actor_id: string | null;
          actor_type: string;
          created_at: string;
          from_status: string | null;
          id: number;
          note: string;
          order_id: string;
          to_status: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          actor_type: string;
          created_at?: string;
          from_status?: string | null;
          id?: number;
          note?: string;
          order_id: string;
          to_status: string;
        };
        Update: {
          actor_id?: string | null;
          actor_type?: string;
          created_at?: string;
          from_status?: string | null;
          id?: number;
          note?: string;
          order_id?: string;
          to_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_order_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "service_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          archived_at: string | null;
          attributes: NonNullable<Json>;
          availability: Database["public"]["Enums"]["availability"];
          category_id: string;
          created_at: string;
          created_by: string | null;
          demo_stock: number | null;
          description: string;
          food_info: Json | null;
          id: string;
          image_url: string;
          moderation_reason: string | null;
          moderation_status: Database["public"]["Enums"]["moderation_status"];
          price_cents_demo: number;
          product_type: string;
          published_at: string | null;
          search: unknown;
          seller_org_id: string;
          slug: string;
          status: Database["public"]["Enums"]["product_status"];
          title: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          attributes?: NonNullable<Json>;
          availability?: Database["public"]["Enums"]["availability"];
          category_id: string;
          created_at?: string;
          created_by?: string | null;
          demo_stock?: number | null;
          description: string;
          food_info?: Json | null;
          id?: string;
          image_url: string;
          moderation_reason?: string | null;
          moderation_status?: Database["public"]["Enums"]["moderation_status"];
          price_cents_demo: number;
          product_type: string;
          published_at?: string | null;
          search?: never;
          seller_org_id: string;
          slug: string;
          status?: Database["public"]["Enums"]["product_status"];
          title: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          archived_at?: string | null;
          attributes?: NonNullable<Json>;
          availability?: Database["public"]["Enums"]["availability"];
          category_id?: string;
          created_at?: string;
          created_by?: string | null;
          demo_stock?: number | null;
          description?: string;
          food_info?: Json | null;
          id?: string;
          image_url?: string;
          moderation_reason?: string | null;
          moderation_status?: Database["public"]["Enums"]["moderation_status"];
          price_cents_demo?: number;
          product_type?: string;
          published_at?: string | null;
          search?: never;
          seller_org_id?: string;
          slug?: string;
          status?: Database["public"]["Enums"]["product_status"];
          title?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "product_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_seller_org_id_fkey";
            columns: ["seller_org_id"];
            isOneToOne: false;
            referencedRelation: "seller_organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      push_outbox: {
        Row: {
          attempts: number;
          claimed_at: string | null;
          created_at: string;
          dedupe_key: string;
          id: number;
          kind: string;
          last_error: string | null;
          not_before: string;
          outcome: string | null;
          payload: Json;
          sent_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          claimed_at?: string | null;
          created_at?: string;
          dedupe_key: string;
          id?: number;
          kind: string;
          last_error?: string | null;
          not_before?: string;
          outcome?: string | null;
          payload?: Json;
          sent_at?: string | null;
          user_id: string;
        };
        Update: {
          attempts?: number;
          claimed_at?: string | null;
          created_at?: string;
          dedupe_key?: string;
          id?: number;
          kind?: string;
          last_error?: string | null;
          not_before?: string;
          outcome?: string | null;
          payload?: Json;
          sent_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          app_version: string | null;
          created_at: string;
          last_seen_at: string;
          platform: string;
          token: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          app_version?: string | null;
          created_at?: string;
          last_seen_at?: string;
          platform: string;
          token: string;
          user_id: string;
        };
        Update: {
          app_version?: string | null;
          created_at?: string;
          last_seen_at?: string;
          platform?: string;
          token?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      quick_signup_attempts: {
        Row: {
          created_at: string;
          email_hash: string;
          id: string;
          ip_hash: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email_hash: string;
          id?: string;
          ip_hash: string;
        };
        Update: {
          created_at?: string;
          email_hash?: string;
          id?: string;
          ip_hash?: string;
        };
        Relationships: [];
      };
      user_generated_passwords: {
        Row: {
          ciphertext: string;
          created_at: string;
          key_version: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          ciphertext: string;
          created_at?: string;
          key_version: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          ciphertext?: string;
          created_at?: string;
          key_version?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          anonymized_at: string | null;
          avatar_url: string | null;
          compare_creator_id: string | null;
          created_at: string;
          display_name: string | null;
          full_name: string | null;
          id: string;
          locale: Database["public"]["Enums"]["locale_code"] | null;
          onboarding_completed: boolean;
          phone_e164: string | null;
          theme: string;
          timezone: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          anonymized_at?: string | null;
          avatar_url?: string | null;
          compare_creator_id?: string | null;
          created_at?: string;
          display_name?: string | null;
          full_name?: string | null;
          id: string;
          locale?: Database["public"]["Enums"]["locale_code"] | null;
          onboarding_completed?: boolean;
          phone_e164?: string | null;
          theme?: string;
          timezone?: string | null;
          updated_at?: string;
        };
        Update: {
          anonymized_at?: string | null;
          avatar_url?: string | null;
          compare_creator_id?: string | null;
          created_at?: string;
          display_name?: string | null;
          full_name?: string | null;
          id?: string;
          locale?: Database["public"]["Enums"]["locale_code"] | null;
          onboarding_completed?: boolean;
          phone_e164?: string | null;
          theme?: string;
          timezone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_compare_creator_id_fkey";
            columns: ["compare_creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      program_item_substitutions: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          original_content_id: string;
          reason: string | null;
          replacement_content_id: string;
          version_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          original_content_id: string;
          reason?: string | null;
          replacement_content_id: string;
          version_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          original_content_id?: string;
          reason?: string | null;
          replacement_content_id?: string;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_item_substitutions_original_content_id_fkey";
            columns: ["original_content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_item_substitutions_replacement_content_id_fkey";
            columns: ["replacement_content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_item_substitutions_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "program_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      program_items: {
        Row: {
          content_id: string;
          id: string;
          is_required: boolean;
          position: number;
          section: string | null;
          version_id: string;
        };
        ComputedFields: never;
        Insert: {
          content_id: string;
          id?: string;
          is_required?: boolean;
          position?: number;
          section?: string | null;
          version_id: string;
        };
        Update: {
          content_id?: string;
          id?: string;
          is_required?: boolean;
          position?: number;
          section?: string | null;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_items_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_items_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "program_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      program_products: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          note: string;
          product_id: string;
          program_id: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string;
          product_id: string;
          program_id: string;
          sort_order: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string;
          product_id?: string;
          program_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_products_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      program_localizations: {
        Row: {
          concept: Json | null;
          description: string | null;
          locale: Database["public"]["Enums"]["locale_code"];
          status: string;
          summary: string | null;
          title: string;
          updated_at: string;
          updated_by: string | null;
          version_id: string;
        };
        ComputedFields: never;
        Insert: {
          concept?: Json | null;
          description?: string | null;
          locale: Database["public"]["Enums"]["locale_code"];
          status?: string;
          summary?: string | null;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          version_id: string;
        };
        Update: {
          concept?: Json | null;
          description?: string | null;
          locale?: Database["public"]["Enums"]["locale_code"];
          status?: string;
          summary?: string | null;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_localizations_version_id_fkey";
            columns: ["version_id"];
            isOneToOne: false;
            referencedRelation: "program_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      program_versions: {
        Row: {
          certificate_fields: NonNullable<Json>;
          concept: Json | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          estimated_weeks: number | null;
          id: string;
          program_id: string;
          published_at: string | null;
          source_locale: Database["public"]["Enums"]["locale_code"];
          status: Database["public"]["Enums"]["content_status"];
          summary: string | null;
          title: string;
          version_no: number;
        };
        ComputedFields: never;
        Insert: {
          certificate_fields?: NonNullable<Json>;
          concept?: Json | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          estimated_weeks?: number | null;
          id?: string;
          program_id: string;
          published_at?: string | null;
          source_locale?: Database["public"]["Enums"]["locale_code"];
          status?: Database["public"]["Enums"]["content_status"];
          summary?: string | null;
          title: string;
          version_no: number;
        };
        Update: {
          certificate_fields?: NonNullable<Json>;
          concept?: Json | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          estimated_weeks?: number | null;
          id?: string;
          program_id?: string;
          published_at?: string | null;
          source_locale?: Database["public"]["Enums"]["locale_code"];
          status?: Database["public"]["Enums"]["content_status"];
          summary?: string | null;
          title?: string;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "program_versions_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      programs: {
        Row: {
          cover_url: string | null;
          created_at: string;
          created_by: string | null;
          creator_id: string | null;
          current_version_id: string | null;
          featured_rank: number | null;
          id: string;
          is_featured: boolean;
          pillar: Database["public"]["Enums"]["pillar"];
          slug: string;
          status: Database["public"]["Enums"]["content_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          cover_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          creator_id?: string | null;
          current_version_id?: string | null;
          featured_rank?: number | null;
          id?: string;
          is_featured?: boolean;
          pillar: Database["public"]["Enums"]["pillar"];
          slug: string;
          status?: Database["public"]["Enums"]["content_status"];
          updated_at?: string;
        };
        Update: {
          cover_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          creator_id?: string | null;
          current_version_id?: string | null;
          featured_rank?: number | null;
          id?: string;
          is_featured?: boolean;
          pillar?: Database["public"]["Enums"]["pillar"];
          slug?: string;
          status?: Database["public"]["Enums"]["content_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "programs_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "programs_current_version_fk";
            columns: ["current_version_id"];
            isOneToOne: false;
            referencedRelation: "program_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_categories: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          name: NonNullable<Json>;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          name: NonNullable<Json>;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          name?: NonNullable<Json>;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      recipe_category_links: {
        Row: {
          category_code: string;
          content_id: string;
        };
        ComputedFields: never;
        Insert: {
          category_code: string;
          content_id: string;
        };
        Update: {
          category_code?: string;
          content_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_category_links_category_code_fkey";
            columns: ["category_code"];
            isOneToOne: false;
            referencedRelation: "recipe_categories";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "recipe_category_links_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_comments: {
        Row: {
          body: string;
          content_id: string;
          created_at: string;
          id: string;
          moderated_at: string | null;
          moderated_by: string | null;
          moderation_reason: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          content_id: string;
          created_at?: string;
          id?: string;
          moderated_at?: string | null;
          moderated_by?: string | null;
          moderation_reason?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          body?: string;
          content_id?: string;
          created_at?: string;
          id?: string;
          moderated_at?: string | null;
          moderated_by?: string | null;
          moderation_reason?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_comments_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_details: {
        Row: {
          allergen_notes: string | null;
          allergens: string[];
          allergens_declared: boolean;
          content_id: string;
          cook_minutes: number | null;
          cover_media_id: string | null;
          created_at: string;
          diets: string[];
          prep_minutes: number | null;
          rating_count: number;
          rating_sum: number;
          rest_minutes: number | null;
          schema_version: number;
          servings: number | null;
          story: string | null;
          total_minutes: number | null;
          updated_at: string;
          yield_text: string | null;
        };
        ComputedFields: never;
        Insert: {
          allergen_notes?: string | null;
          allergens?: string[];
          allergens_declared?: boolean;
          content_id: string;
          cook_minutes?: number | null;
          cover_media_id?: string | null;
          created_at?: string;
          diets?: string[];
          prep_minutes?: number | null;
          rating_count?: number;
          rating_sum?: number;
          rest_minutes?: number | null;
          schema_version?: number;
          servings?: number | null;
          story?: string | null;
          total_minutes?: number | null;
          updated_at?: string;
          yield_text?: string | null;
        };
        Update: {
          allergen_notes?: string | null;
          allergens?: string[];
          allergens_declared?: boolean;
          content_id?: string;
          cook_minutes?: number | null;
          cover_media_id?: string | null;
          created_at?: string;
          diets?: string[];
          prep_minutes?: number | null;
          rating_count?: number;
          rating_sum?: number;
          rest_minutes?: number | null;
          schema_version?: number;
          servings?: number | null;
          story?: string | null;
          total_minutes?: number | null;
          updated_at?: string;
          yield_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_details_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: true;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_details_cover_fk";
            columns: ["cover_media_id", "content_id"];
            isOneToOne: false;
            referencedRelation: "recipe_media";
            referencedColumns: ["id", "content_id"];
          },
        ];
      };
      recipe_extras: {
        Row: {
          chef_note: string | null;
          content_id: string;
          ingredient_terms: unknown;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          chef_note?: string | null;
          content_id: string;
          ingredient_terms?: unknown;
          updated_at?: string;
        };
        Update: {
          chef_note?: string | null;
          content_id?: string;
          ingredient_terms?: unknown;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_extras_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: true;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_ingredient_products: {
        Row: {
          content_id: string;
          created_at: string;
          id: string;
          ingredient_id: string;
          note: string | null;
          product_id: string;
          product_version_at_validation: number | null;
          status: Database["public"]["Enums"]["link_status"];
          suspended_reason: string | null;
          updated_at: string;
          validated_at: string | null;
          validated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          content_id: string;
          created_at?: string;
          id?: string;
          ingredient_id: string;
          note?: string | null;
          product_id: string;
          product_version_at_validation?: number | null;
          status?: Database["public"]["Enums"]["link_status"];
          suspended_reason?: string | null;
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Update: {
          content_id?: string;
          created_at?: string;
          id?: string;
          ingredient_id?: string;
          note?: string | null;
          product_id?: string;
          product_version_at_validation?: number | null;
          status?: Database["public"]["Enums"]["link_status"];
          suspended_reason?: string | null;
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_ingredient_products_ingredient_fk";
            columns: ["ingredient_id", "content_id"];
            isOneToOne: false;
            referencedRelation: "recipe_ingredients";
            referencedColumns: ["id", "content_id"];
          },
          {
            foreignKeyName: "recipe_ingredient_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_ingredients: {
        Row: {
          content_id: string;
          created_at: string;
          id: string;
          name: string;
          note: string | null;
          optional: boolean;
          position: number;
          quantity: number | null;
          quantity_text: string | null;
          source_qty: string | null;
          substitutions: NonNullable<Json>;
          to_taste: boolean;
          unit: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          content_id: string;
          created_at?: string;
          id?: string;
          name: string;
          note?: string | null;
          optional?: boolean;
          position: number;
          quantity?: number | null;
          quantity_text?: string | null;
          source_qty?: string | null;
          substitutions?: NonNullable<Json>;
          to_taste?: boolean;
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          content_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          note?: string | null;
          optional?: boolean;
          position?: number;
          quantity?: number | null;
          quantity_text?: string | null;
          source_qty?: string | null;
          substitutions?: NonNullable<Json>;
          to_taste?: boolean;
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_media: {
        Row: {
          alt_text: string | null;
          bytes: number;
          caption: string | null;
          content_id: string;
          created_at: string;
          created_by: string | null;
          creator_id: string;
          height: number | null;
          id: string;
          mime: string;
          position: number;
          rights_confirmed_at: string;
          role: string;
          storage_path: string;
          updated_at: string;
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          alt_text?: string | null;
          bytes: number;
          caption?: string | null;
          content_id: string;
          created_at?: string;
          created_by?: string | null;
          creator_id: string;
          height?: number | null;
          id?: string;
          mime: string;
          position?: number;
          rights_confirmed_at: string;
          role: string;
          storage_path: string;
          updated_at?: string;
          width?: number | null;
        };
        Update: {
          alt_text?: string | null;
          bytes?: number;
          caption?: string | null;
          content_id?: string;
          created_at?: string;
          created_by?: string | null;
          creator_id?: string;
          height?: number | null;
          id?: string;
          mime?: string;
          position?: number;
          rights_confirmed_at?: string;
          role?: string;
          storage_path?: string;
          updated_at?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_media_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_media_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_nutrition: {
        Row: {
          carbs_g: number | null;
          content_id: string;
          fat_g: number | null;
          fiber_g: number | null;
          kcal: number | null;
          protein_g: number | null;
          sodium_mg: number | null;
          source: string;
          source_note: string | null;
          updated_at: string;
          validated: boolean;
          validated_at: string | null;
          validated_by: string | null;
          validated_by_user: string | null;
          validation_note: string | null;
        };
        ComputedFields: never;
        Insert: {
          carbs_g?: number | null;
          content_id: string;
          fat_g?: number | null;
          fiber_g?: number | null;
          kcal?: number | null;
          protein_g?: number | null;
          sodium_mg?: number | null;
          source?: string;
          source_note?: string | null;
          updated_at?: string;
          validated?: boolean;
          validated_at?: string | null;
          validated_by?: string | null;
          validated_by_user?: string | null;
          validation_note?: string | null;
        };
        Update: {
          carbs_g?: number | null;
          content_id?: string;
          fat_g?: number | null;
          fiber_g?: number | null;
          kcal?: number | null;
          protein_g?: number | null;
          sodium_mg?: number | null;
          source?: string;
          source_note?: string | null;
          updated_at?: string;
          validated?: boolean;
          validated_at?: string | null;
          validated_by?: string | null;
          validated_by_user?: string | null;
          validation_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_nutrition_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: true;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_action_counters: {
        Row: {
          action: string;
          content_id: string;
          count: number;
          creator_id: string;
          day: string;
          source_key: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          content_id: string;
          count?: number;
          creator_id: string;
          day: string;
          source_key: string;
          updated_at?: string;
        };
        Update: {
          action?: string;
          content_id?: string;
          count?: number;
          creator_id?: string;
          day?: string;
          source_key?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_action_counters_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_action_counters_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_ready_products: {
        Row: {
          content_id: string;
          created_at: string;
          product_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          content_id: string;
          created_at?: string;
          product_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          content_id?: string;
          created_at?: string;
          product_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_ready_products_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: true;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_ready_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_signers: {
        Row: {
          chef_id: string | null;
          content_id: string;
          created_at: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          chef_id?: string | null;
          content_id: string;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          chef_id?: string | null;
          content_id?: string;
          created_at?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_signers_chef_id_fkey";
            columns: ["chef_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_signers_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: true;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_onboarding: {
        Row: {
          allergies: string[];
          completed_at: string;
          notice_accepted_at: string;
          restrictions: string[];
          updated_at: string;
          user_id: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          allergies?: string[];
          completed_at?: string;
          notice_accepted_at: string;
          restrictions?: string[];
          updated_at?: string;
          user_id: string;
          version?: number;
        };
        Update: {
          allergies?: string[];
          completed_at?: string;
          notice_accepted_at?: string;
          restrictions?: string[];
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      recipe_ratings: {
        Row: {
          content_id: string;
          created_at: string;
          is_demo: boolean;
          stars: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          content_id: string;
          created_at?: string;
          is_demo?: boolean;
          stars: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          content_id?: string;
          created_at?: string;
          is_demo?: boolean;
          stars?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_ratings_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_step_ingredients: {
        Row: {
          content_id: string;
          ingredient_id: string;
          step_id: string;
        };
        ComputedFields: never;
        Insert: {
          content_id: string;
          ingredient_id: string;
          step_id: string;
        };
        Update: {
          content_id?: string;
          ingredient_id?: string;
          step_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_step_ingredients_ingredient_fk";
            columns: ["ingredient_id", "content_id"];
            isOneToOne: false;
            referencedRelation: "recipe_ingredients";
            referencedColumns: ["id", "content_id"];
          },
          {
            foreignKeyName: "recipe_step_ingredients_step_fk";
            columns: ["step_id", "content_id"];
            isOneToOne: false;
            referencedRelation: "recipe_steps";
            referencedColumns: ["id", "content_id"];
          },
        ];
      };
      recipe_steps: {
        Row: {
          content_id: string;
          created_at: string;
          duration_seconds: number | null;
          id: string;
          image_media_id: string | null;
          instruction: string;
          position: number;
          temperature_c: number | null;
          tip: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          content_id: string;
          created_at?: string;
          duration_seconds?: number | null;
          id?: string;
          image_media_id?: string | null;
          instruction: string;
          position: number;
          temperature_c?: number | null;
          tip?: string | null;
          updated_at?: string;
        };
        Update: {
          content_id?: string;
          created_at?: string;
          duration_seconds?: number | null;
          id?: string;
          image_media_id?: string | null;
          instruction?: string;
          position?: number;
          temperature_c?: number | null;
          tip?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_steps_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_steps_image_fk";
            columns: ["image_media_id", "content_id"];
            isOneToOne: false;
            referencedRelation: "recipe_media";
            referencedColumns: ["id", "content_id"];
          },
        ];
      };
      recipe_versions: {
        Row: {
          changed_sections: string[];
          content_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          reason: string;
          snapshot: NonNullable<Json>;
          snapshot_hash: string;
          version_no: number;
        };
        ComputedFields: never;
        Insert: {
          changed_sections?: string[];
          content_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          reason: string;
          snapshot: NonNullable<Json>;
          snapshot_hash: string;
          version_no: number;
        };
        Update: {
          changed_sections?: string[];
          content_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          reason?: string;
          snapshot?: NonNullable<Json>;
          snapshot_hash?: string;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_versions_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_view_history: {
        Row: {
          content_id: string;
          user_id: string;
          viewed_at: string;
        };
        ComputedFields: never;
        Insert: {
          content_id: string;
          user_id?: string;
          viewed_at?: string;
        };
        Update: {
          content_id?: string;
          user_id?: string;
          viewed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_view_history_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      recommendation_runs: {
        Row: {
          candidates: number | null;
          cost_estimate_usd: number | null;
          created_at: string;
          engine: string;
          error: string | null;
          id: string;
          input_tokens: number | null;
          latency_ms: number | null;
          output_tokens: number | null;
          provider_model: string | null;
          returned: number | null;
          trigger: string;
          user_id: string | null;
          valid_rate: number | null;
        };
        ComputedFields: never;
        Insert: {
          candidates?: number | null;
          cost_estimate_usd?: number | null;
          created_at?: string;
          engine: string;
          error?: string | null;
          id?: string;
          input_tokens?: number | null;
          latency_ms?: number | null;
          output_tokens?: number | null;
          provider_model?: string | null;
          returned?: number | null;
          trigger: string;
          user_id?: string | null;
          valid_rate?: number | null;
        };
        Update: {
          candidates?: number | null;
          cost_estimate_usd?: number | null;
          created_at?: string;
          engine?: string;
          error?: string | null;
          id?: string;
          input_tokens?: number | null;
          latency_ms?: number | null;
          output_tokens?: number | null;
          provider_model?: string | null;
          returned?: number | null;
          trigger?: string;
          user_id?: string | null;
          valid_rate?: number | null;
        };
        Relationships: [];
      };
      retention_exceptions: {
        Row: {
          closed_at: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          owner_id: string | null;
          reason: string;
          review_at: string;
          scope_id: string;
          scope_type: string;
        };
        ComputedFields: never;
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          owner_id?: string | null;
          reason: string;
          review_at: string;
          scope_id: string;
          scope_type: string;
        };
        Update: {
          closed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          owner_id?: string | null;
          reason?: string;
          review_at?: string;
          scope_id?: string;
          scope_type?: string;
        };
        Relationships: [];
      };
      retention_jobs: {
        Row: {
          affected: number;
          details: Json | null;
          id: number;
          job: string;
          ran_at: string;
        };
        ComputedFields: never;
        Insert: {
          affected?: number;
          details?: Json | null;
          id?: never;
          job: string;
          ran_at?: string;
        };
        Update: {
          affected?: number;
          details?: Json | null;
          id?: never;
          job?: string;
          ran_at?: string;
        };
        Relationships: [];
      };
      role_assignments: {
        Row: {
          created_at: string;
          granted_by: string | null;
          id: string;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["app_role"];
          scope_id: string | null;
          scope_type: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          revoked_at?: string | null;
          role: Database["public"]["Enums"]["app_role"];
          scope_id?: string | null;
          scope_type?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          scope_id?: string | null;
          scope_type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      routine_checks: {
        Row: {
          checked_at: string;
          done: boolean;
          item_id: string;
          local_date: string;
          timezone: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          checked_at?: string;
          done?: boolean;
          item_id: string;
          local_date: string;
          timezone: string;
          user_id: string;
        };
        Update: {
          checked_at?: string;
          done?: boolean;
          item_id?: string;
          local_date?: string;
          timezone?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "routine_checks_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "routine_items";
            referencedColumns: ["id"];
          },
        ];
      };
      routine_items: {
        Row: {
          active: boolean;
          content_id: string | null;
          created_at: string;
          id: string;
          note: string | null;
          sort_order: number;
          time_of_day: string | null;
          title: string;
          updated_at: string;
          user_id: string;
          weekdays: number[] | null;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          content_id?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          sort_order?: number;
          time_of_day?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
          weekdays?: number[] | null;
        };
        Update: {
          active?: boolean;
          content_id?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          sort_order?: number;
          time_of_day?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
          weekdays?: number[] | null;
        };
        Relationships: [
          {
            foreignKeyName: "routine_items_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_memberships: {
        Row: {
          created_at: string;
          id: string;
          org_id: string;
          revoked_at: string | null;
          role: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          org_id: string;
          revoked_at?: string | null;
          role?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          org_id?: string;
          revoked_at?: string | null;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seller_memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "seller_organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      seller_organizations: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_fictional: boolean;
          kind: string;
          logo_url: string | null;
          name: string;
          slug: string;
          status: Database["public"]["Enums"]["partner_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_fictional?: boolean;
          kind: string;
          logo_url?: string | null;
          name: string;
          slug: string;
          status?: Database["public"]["Enums"]["partner_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_fictional?: boolean;
          kind?: string;
          logo_url?: string | null;
          name?: string;
          slug?: string;
          status?: Database["public"]["Enums"]["partner_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      shop_filter_categories: {
        Row: {
          category_id: string;
          created_at: string;
          filter_id: string;
        };
        ComputedFields: never;
        Insert: {
          category_id: string;
          created_at?: string;
          filter_id: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          filter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shop_filter_categories_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "product_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shop_filter_categories_filter_id_fkey";
            columns: ["filter_id"];
            isOneToOne: false;
            referencedRelation: "shop_filters";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_filter_products: {
        Row: {
          created_at: string;
          filter_id: string;
          product_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          filter_id: string;
          product_id: string;
        };
        Update: {
          created_at?: string;
          filter_id?: string;
          product_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shop_filter_products_filter_id_fkey";
            columns: ["filter_id"];
            isOneToOne: false;
            referencedRelation: "shop_filters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shop_filter_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      shop_filters: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: NonNullable<Json>;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: NonNullable<Json>;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: NonNullable<Json>;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      shopping_list_items: {
        Row: {
          checked: boolean;
          content_id: string | null;
          created_at: string;
          id: string;
          ingredient_id: string | null;
          name: string;
          position: number;
          product_id: string | null;
          quantity: number | null;
          quantity_text: string | null;
          unit: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          checked?: boolean;
          content_id?: string | null;
          created_at?: string;
          id?: string;
          ingredient_id?: string | null;
          name: string;
          position?: number;
          product_id?: string | null;
          quantity?: number | null;
          quantity_text?: string | null;
          unit?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          checked?: boolean;
          content_id?: string | null;
          created_at?: string;
          id?: string;
          ingredient_id?: string | null;
          name?: string;
          position?: number;
          product_id?: string | null;
          quantity?: number | null;
          quantity_text?: string | null;
          unit?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shopping_list_items_ingredient_id_fkey";
            columns: ["ingredient_id"];
            isOneToOne: false;
            referencedRelation: "recipe_ingredients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shopping_list_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      brands: {
        Row: {
          created_at: string;
          created_by: string | null;
          default_relationship: string;
          id: string;
          is_demo: boolean;
          logo_url: string | null;
          name: string;
          site_url: string;
          slug: string;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          default_relationship?: string;
          id?: string;
          is_demo?: boolean;
          logo_url?: string | null;
          name: string;
          site_url: string;
          slug: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          default_relationship?: string;
          id?: string;
          is_demo?: boolean;
          logo_url?: string | null;
          name?: string;
          site_url?: string;
          slug?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      brand_products: {
        Row: {
          brand_id: string;
          created_at: string;
          created_by: string | null;
          currency: string;
          description: string;
          external_url: string;
          id: string;
          image_url: string | null;
          is_demo: boolean;
          name: string;
          price_cents: number | null;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string;
          external_url: string;
          id?: string;
          image_url?: string | null;
          is_demo?: boolean;
          name: string;
          price_cents?: number | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          description?: string;
          external_url?: string;
          id?: string;
          image_url?: string | null;
          is_demo?: boolean;
          name?: string;
          price_cents?: number | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "brand_products_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      creator_brands: {
        Row: {
          brand_id: string;
          created_at: string;
          creator_id: string;
          id: string;
          relationship: string;
          sort_order: number;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          created_at?: string;
          creator_id: string;
          id?: string;
          relationship: string;
          sort_order?: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          creator_id?: string;
          id?: string;
          relationship?: string;
          sort_order?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "creator_brands_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "creator_brands_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      content_brands: {
        Row: {
          brand_id: string;
          content_id: string;
          created_at: string;
          id: string;
          relationship: string;
          sort_order: number;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          content_id: string;
          created_at?: string;
          id?: string;
          relationship: string;
          sort_order?: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          brand_id?: string;
          content_id?: string;
          created_at?: string;
          id?: string;
          relationship?: string;
          sort_order?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_brands_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_brands_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      content_brand_products: {
        Row: {
          brand_product_id: string;
          content_id: string;
          created_at: string;
          id: string;
          sort_order: number;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          brand_product_id: string;
          content_id: string;
          created_at?: string;
          id?: string;
          sort_order?: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          brand_product_id?: string;
          content_id?: string;
          created_at?: string;
          id?: string;
          sort_order?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_brand_products_brand_product_id_fkey";
            columns: ["brand_product_id"];
            isOneToOne: false;
            referencedRelation: "brand_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_brand_products_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      program_brand_products: {
        Row: {
          brand_product_id: string;
          created_at: string;
          id: string;
          note: string;
          program_id: string;
          sort_order: number;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          brand_product_id: string;
          created_at?: string;
          id?: string;
          note?: string;
          program_id: string;
          sort_order?: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          brand_product_id?: string;
          created_at?: string;
          id?: string;
          note?: string;
          program_id?: string;
          sort_order?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_brand_products_brand_product_id_fkey";
            columns: ["brand_product_id"];
            isOneToOne: false;
            referencedRelation: "brand_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_brand_products_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      media_smart_tags: {
        Row: {
          brand_product_id: string;
          content_id: string;
          created_at: string;
          id: string;
          is_demo: boolean;
          label_side: string;
          media_key: string;
          media_url: string | null;
          sort_order: number;
          status: string;
          updated_at: string;
          x_pct: number;
          y_pct: number;
        };
        ComputedFields: never;
        Insert: {
          brand_product_id: string;
          content_id: string;
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          label_side?: string;
          media_key?: string;
          media_url?: string | null;
          sort_order?: number;
          status?: string;
          updated_at?: string;
          x_pct: number;
          y_pct: number;
        };
        Update: {
          brand_product_id?: string;
          content_id?: string;
          created_at?: string;
          id?: string;
          is_demo?: boolean;
          label_side?: string;
          media_key?: string;
          media_url?: string | null;
          sort_order?: number;
          status?: string;
          updated_at?: string;
          x_pct?: number;
          y_pct?: number;
        };
        Relationships: [
          {
            foreignKeyName: "media_smart_tags_brand_product_id_fkey";
            columns: ["brand_product_id"];
            isOneToOne: false;
            referencedRelation: "brand_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_smart_tags_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      brand_click_counters: {
        Row: {
          count: number;
          day: string;
          id: number;
          source: string;
          target_id: string;
          target_kind: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          count?: number;
          day: string;
          id?: number;
          source: string;
          target_id: string;
          target_kind: string;
          updated_at?: string;
        };
        Update: {
          count?: number;
          day?: string;
          id?: number;
          source?: string;
          target_id?: string;
          target_kind?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      shortcut_open_counters: {
        Row: {
          count: number;
          creator_id: string;
          day: string;
          id: number;
          source_key: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          count?: number;
          creator_id: string;
          day: string;
          id?: number;
          source_key: string;
          updated_at?: string;
        };
        Update: {
          count?: number;
          creator_id?: string;
          day?: string;
          id?: number;
          source_key?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      hero_blocks: {
        Row: { created_at: string; creator_id: string; user_id: string };
        ComputedFields: never;
        Insert: { created_at?: string; creator_id: string; user_id: string };
        Update: { created_at?: string; creator_id?: string; user_id?: string };
        Relationships: [];
      };
      content_reports: {
        Row: {
          content_id: string | null;
          created_at: string;
          creator_id: string | null;
          details: string;
          id: string;
          reason: string;
          reporter_id: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          content_id?: string | null;
          created_at?: string;
          creator_id?: string | null;
          details?: string;
          id?: string;
          reason: string;
          reporter_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
        };
        Update: {
          content_id?: string | null;
          created_at?: string;
          creator_id?: string | null;
          details?: string;
          id?: string;
          reason?: string;
          reporter_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
        };
        Relationships: [
          { foreignKeyName: "content_reports_content_fk"; columns: ["content_id"]; isOneToOne: false; referencedRelation: "content"; referencedColumns: ["id"] },
          { foreignKeyName: "content_reports_creator_fk"; columns: ["creator_id"]; isOneToOne: false; referencedRelation: "creator_profiles"; referencedColumns: ["id"] },
        ];
      };
      partner_terms_acceptances: {
        Row: {
          accepted_at: string;
          terms_version: string;
          upload_rights_confirmed_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string;
          terms_version: string;
          upload_rights_confirmed_at?: string | null;
          user_id: string;
        };
        Update: {
          accepted_at?: string;
          terms_version?: string;
          upload_rights_confirmed_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      hero_page_view_counters: {
        Row: {
          count: number;
          creator_id: string;
          day: string;
          id: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          count?: number;
          creator_id: string;
          day: string;
          id?: number;
          updated_at?: string;
        };
        Update: {
          count?: number;
          creator_id?: string;
          day?: string;
          id?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      simulated_subscriptions: {
        Row: {
          auto_renew: boolean;
          cancelled_at: string | null;
          created_at: string;
          current_period_end: string;
          current_period_start: string;
          id: string;
          status: Database["public"]["Enums"]["subscription_status"];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          auto_renew?: boolean;
          cancelled_at?: string | null;
          created_at?: string;
          current_period_end?: string;
          current_period_start?: string;
          id?: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          auto_renew?: boolean;
          cancelled_at?: string | null;
          created_at?: string;
          current_period_end?: string;
          current_period_start?: string;
          id?: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      streak_events: {
        Row: {
          id: number;
          kind: string;
          local_date: string;
          occurred_at: string;
          ref_id: string | null;
          timezone: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: never;
          kind: string;
          local_date: string;
          occurred_at?: string;
          ref_id?: string | null;
          timezone: string;
          user_id: string;
        };
        Update: {
          id?: never;
          kind?: string;
          local_date?: string;
          occurred_at?: string;
          ref_id?: string | null;
          timezone?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      stream_uploads: {
        Row: {
          checked_at: string | null;
          content_id: string | null;
          created_at: string;
          creator_id: string;
          discarded_at: string | null;
          expires_at: string;
          provider_deleted_at: string | null;
          uid: string;
        };
        ComputedFields: never;
        Insert: {
          checked_at?: string | null;
          content_id?: string | null;
          created_at?: string;
          creator_id: string;
          discarded_at?: string | null;
          expires_at: string;
          provider_deleted_at?: string | null;
          uid: string;
        };
        Update: {
          checked_at?: string | null;
          content_id?: string | null;
          created_at?: string;
          creator_id?: string;
          discarded_at?: string | null;
          expires_at?: string;
          provider_deleted_at?: string | null;
          uid?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stream_uploads_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stream_uploads_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_events: {
        Row: {
          created_at: string;
          event: string;
          id: number;
          payload: NonNullable<Json>;
          subscription_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event: string;
          id?: never;
          payload?: NonNullable<Json>;
          subscription_id: string;
        };
        Update: {
          created_at?: string;
          event?: string;
          id?: never;
          payload?: NonNullable<Json>;
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_events_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "simulated_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      subscription_modules: {
        Row: {
          activated_at: string;
          module_id: string;
          removal_at: string | null;
          status: string;
          subscription_id: string;
        };
        ComputedFields: never;
        Insert: {
          activated_at?: string;
          module_id: string;
          removal_at?: string | null;
          status?: string;
          subscription_id: string;
        };
        Update: {
          activated_at?: string;
          module_id?: string;
          removal_at?: string | null;
          status?: string;
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscription_modules_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "plan_modules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscription_modules_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "simulated_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      test_fulfillments: {
        Row: {
          created_at: string;
          destination_zone: string;
          eta_days: number | null;
          id: string;
          order_id: string;
          seller_name_snapshot: string;
          seller_org_id: string;
          shipping_cents_snapshot: number;
          status: Database["public"]["Enums"]["fulfillment_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          destination_zone: string;
          eta_days?: number | null;
          id?: string;
          order_id: string;
          seller_name_snapshot: string;
          seller_org_id: string;
          shipping_cents_snapshot?: number;
          status?: Database["public"]["Enums"]["fulfillment_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          destination_zone?: string;
          eta_days?: number | null;
          id?: string;
          order_id?: string;
          seller_name_snapshot?: string;
          seller_org_id?: string;
          shipping_cents_snapshot?: number;
          status?: Database["public"]["Enums"]["fulfillment_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "test_fulfillments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "test_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "test_fulfillments_seller_org_id_fkey";
            columns: ["seller_org_id"];
            isOneToOne: false;
            referencedRelation: "seller_organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      test_order_items: {
        Row: {
          fulfillment_id: string;
          id: string;
          image_snapshot: string | null;
          order_id: string;
          price_cents_snapshot: number;
          product_id: string | null;
          product_version_snapshot: number | null;
          quantity: number;
          seller_org_id: string;
          title_snapshot: string;
        };
        ComputedFields: never;
        Insert: {
          fulfillment_id: string;
          id?: string;
          image_snapshot?: string | null;
          order_id: string;
          price_cents_snapshot: number;
          product_id?: string | null;
          product_version_snapshot?: number | null;
          quantity: number;
          seller_org_id: string;
          title_snapshot: string;
        };
        Update: {
          fulfillment_id?: string;
          id?: string;
          image_snapshot?: string | null;
          order_id?: string;
          price_cents_snapshot?: number;
          product_id?: string | null;
          product_version_snapshot?: number | null;
          quantity?: number;
          seller_org_id?: string;
          title_snapshot?: string;
        };
        Relationships: [
          {
            foreignKeyName: "test_order_items_fulfillment_id_fkey";
            columns: ["fulfillment_id"];
            isOneToOne: false;
            referencedRelation: "test_fulfillments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "test_order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "test_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "test_order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "test_order_items_seller_org_id_fkey";
            columns: ["seller_org_id"];
            isOneToOne: false;
            referencedRelation: "seller_organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      test_orders: {
        Row: {
          anonymized_at: string | null;
          completed_at: string | null;
          confirmed_at: string;
          created_at: string;
          destination_snapshot: NonNullable<Json>;
          id: string;
          is_demo: boolean;
          retention_expires_at: string;
          shipping_cents: number;
          status: Database["public"]["Enums"]["order_status"];
          subtotal_cents: number;
          total_cents: number;
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          anonymized_at?: string | null;
          completed_at?: string | null;
          confirmed_at?: string;
          created_at?: string;
          destination_snapshot: NonNullable<Json>;
          id?: string;
          is_demo?: boolean;
          retention_expires_at?: string;
          shipping_cents: number;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal_cents: number;
          total_cents: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          anonymized_at?: string | null;
          completed_at?: string | null;
          confirmed_at?: string;
          created_at?: string;
          destination_snapshot?: NonNullable<Json>;
          id?: string;
          is_demo?: boolean;
          retention_expires_at?: string;
          shipping_cents?: number;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal_cents?: number;
          total_cents?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      user_achievements: {
        Row: {
          achievement_id: string;
          earned_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          achievement_id: string;
          earned_at?: string;
          user_id: string;
        };
        Update: {
          achievement_id?: string;
          earned_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
        ];
      };
      user_alerts: {
        Row: {
          amount_cents: number;
          collectible_id: string;
          created_at: string;
          id: string;
          kind: string;
          seen_at: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          collectible_id: string;
          created_at?: string;
          id?: string;
          kind: string;
          seen_at?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount_cents?: number;
          collectible_id?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          seen_at?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_alerts_collectible_id_fkey";
            columns: ["collectible_id"];
            isOneToOne: false;
            referencedRelation: "collectibles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_interests: {
        Row: {
          created_at: string;
          tag: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          tag: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          tag?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_interests_tag_fkey";
            columns: ["tag"];
            isOneToOne: false;
            referencedRelation: "interest_tags";
            referencedColumns: ["tag"];
          },
        ];
      };
      user_recipe_prefs: {
        Row: {
          history_enabled: boolean;
          history_enabled_at: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          history_enabled?: boolean;
          history_enabled_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          history_enabled?: boolean;
          history_enabled_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_recommendations: {
        Row: {
          content_id: string;
          engine: string;
          generated_at: string;
          is_fallback: boolean;
          rank: number;
          reason: string | null;
          score: number | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          content_id: string;
          engine: string;
          generated_at?: string;
          is_fallback?: boolean;
          rank: number;
          reason?: string | null;
          score?: number | null;
          user_id: string;
        };
        Update: {
          content_id?: string;
          engine?: string;
          generated_at?: string;
          is_fallback?: boolean;
          rank?: number;
          reason?: string | null;
          score?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_recommendations_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
        ];
      };
      agencies: {
        Row: {
          contact_email: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          is_demo: boolean;
          name: string;
          relationship_alert_days: number;
          service_rate_bp: number;
          slug: string;
          status: string;
          timezone: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          contact_email?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_demo?: boolean;
          name: string;
          relationship_alert_days?: number;
          service_rate_bp?: number;
          slug: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          contact_email?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_demo?: boolean;
          name?: string;
          relationship_alert_days?: number;
          service_rate_bp?: number;
          slug?: string;
          status?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agency_members: {
        Row: {
          agency_id: string;
          created_at: string;
          display_name: string;
          id: string;
          invited_by: string | null;
          job_title: string | null;
          revoked_at: string | null;
          role: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          created_at?: string;
          display_name: string;
          id?: string;
          invited_by?: string | null;
          job_title?: string | null;
          revoked_at?: string | null;
          role: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          agency_id?: string;
          created_at?: string;
          display_name?: string;
          id?: string;
          invited_by?: string | null;
          job_title?: string | null;
          revoked_at?: string | null;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agency_members_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      agency_brands: {
        Row: {
          account_manager_id: string | null;
          agency_id: string;
          brand_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          is_demo: boolean;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          account_manager_id?: string | null;
          agency_id: string;
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_demo?: boolean;
          status?: string;
          updated_at?: string;
        };
        Update: {
          account_manager_id?: string | null;
          agency_id?: string;
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_demo?: boolean;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "agency_brands_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "agency_brands_brand_fk";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      brand_members: {
        Row: {
          brand_id: string;
          created_at: string;
          display_name: string;
          id: string;
          invited_by: string | null;
          job_title: string | null;
          revoked_at: string | null;
          role: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          brand_id: string;
          created_at?: string;
          display_name: string;
          id?: string;
          invited_by?: string | null;
          job_title?: string | null;
          revoked_at?: string | null;
          role?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          brand_id?: string;
          created_at?: string;
          display_name?: string;
          id?: string;
          invited_by?: string | null;
          job_title?: string | null;
          revoked_at?: string | null;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "brand_members_brand_fk";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
        ];
      };
      inbox_notifications: {
        Row: {
          agency_id: string | null;
          created_at: string;
          dedupe_key: string | null;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          kind: string;
          link: string;
          params: NonNullable<Json>;
          read_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          agency_id?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          kind: string;
          link: string;
          params?: NonNullable<Json>;
          read_at?: string | null;
          user_id: string;
        };
        Update: {
          agency_id?: string | null;
          created_at?: string;
          dedupe_key?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          kind?: string;
          link?: string;
          params?: NonNullable<Json>;
          read_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inbox_notifications_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          agency_id: string;
          archived_at: string | null;
          brand_id: string | null;
          created_at: string;
          deal_id: string | null;
          id: string;
          kind: string;
          mime_type: string;
          request_id: string | null;
          restricted: boolean;
          retention_until: string | null;
          scope_type: string;
          share_brand: boolean;
          share_talent: boolean;
          size_bytes: number;
          status: string;
          storage_path: string;
          talent_id: string | null;
          title: string;
          updated_at: string;
          uploaded_by: string | null;
          uploader_side: string;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          archived_at?: string | null;
          brand_id?: string | null;
          created_at?: string;
          deal_id?: string | null;
          id?: string;
          kind: string;
          mime_type: string;
          request_id?: string | null;
          restricted?: boolean;
          retention_until?: string | null;
          scope_type: string;
          share_brand?: boolean;
          share_talent?: boolean;
          size_bytes: number;
          status?: string;
          storage_path: string;
          talent_id?: string | null;
          title: string;
          updated_at?: string;
          uploaded_by?: string | null;
          uploader_side: string;
        };
        Update: {
          agency_id?: string;
          archived_at?: string | null;
          brand_id?: string | null;
          created_at?: string;
          deal_id?: string | null;
          id?: string;
          kind?: string;
          mime_type?: string;
          request_id?: string | null;
          restricted?: boolean;
          retention_until?: string | null;
          scope_type?: string;
          share_brand?: boolean;
          share_talent?: boolean;
          size_bytes?: number;
          status?: string;
          storage_path?: string;
          talent_id?: string | null;
          title?: string;
          updated_at?: string;
          uploaded_by?: string | null;
          uploader_side?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_brand_fk";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_deal_fk";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_request_fk";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "campaign_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      talent_segments: {
        Row: {
          active: boolean;
          agency_id: string;
          created_at: string;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          agency_id: string;
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          agency_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_segments_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
        ];
      };
      talent_profiles: {
        Row: {
          agency_id: string;
          archived_at: string | null;
          availability: string;
          availability_note: string;
          catalog_visible: boolean;
          city: string | null;
          commercial_status: string;
          consent_at: string | null;
          consent_revoked_at: string | null;
          consent_version: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          country: string;
          created_at: string;
          created_by: string | null;
          creator_id: string | null;
          display_name: string;
          id: string;
          internal_notes: string;
          is_demo: boolean;
          last_contact_at: string | null;
          manager_id: string | null;
          state: string | null;
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          archived_at?: string | null;
          availability?: string;
          availability_note?: string;
          catalog_visible?: boolean;
          city?: string | null;
          commercial_status?: string;
          consent_at?: string | null;
          consent_revoked_at?: string | null;
          consent_version?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          country?: string;
          created_at?: string;
          created_by?: string | null;
          creator_id?: string | null;
          display_name: string;
          id?: string;
          internal_notes?: string;
          is_demo?: boolean;
          last_contact_at?: string | null;
          manager_id?: string | null;
          state?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          agency_id?: string;
          archived_at?: string | null;
          availability?: string;
          availability_note?: string;
          catalog_visible?: boolean;
          city?: string | null;
          commercial_status?: string;
          consent_at?: string | null;
          consent_revoked_at?: string | null;
          consent_version?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          country?: string;
          created_at?: string;
          created_by?: string | null;
          creator_id?: string | null;
          display_name?: string;
          id?: string;
          internal_notes?: string;
          is_demo?: boolean;
          last_contact_at?: string | null;
          manager_id?: string | null;
          state?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "talent_profiles_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_profiles_creator_fk";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "creator_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      talent_segment_links: {
        Row: {
          agency_id: string;
          created_at: string;
          id: string;
          segment_id: string;
          talent_id: string;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          created_at?: string;
          id?: string;
          segment_id: string;
          talent_id: string;
        };
        Update: {
          agency_id?: string;
          created_at?: string;
          id?: string;
          segment_id?: string;
          talent_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_segment_links_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_segment_links_segment_fk";
            columns: ["segment_id"];
            isOneToOne: false;
            referencedRelation: "talent_segments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_segment_links_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      talent_social_accounts: {
        Row: {
          agency_id: string;
          as_of: string;
          audience: NonNullable<Json>;
          avg_reach: number | null;
          avg_views: number | null;
          created_at: string;
          declared_by: string | null;
          declared_side: string;
          engagement_bp: number | null;
          followers: number | null;
          handle: string;
          id: string;
          network: string;
          source: string;
          talent_id: string;
          updated_at: string;
          url: string | null;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          as_of: string;
          audience?: NonNullable<Json>;
          avg_reach?: number | null;
          avg_views?: number | null;
          created_at?: string;
          declared_by?: string | null;
          declared_side: string;
          engagement_bp?: number | null;
          followers?: number | null;
          handle: string;
          id?: string;
          network: string;
          source?: string;
          talent_id: string;
          updated_at?: string;
          url?: string | null;
        };
        Update: {
          agency_id?: string;
          as_of?: string;
          audience?: NonNullable<Json>;
          avg_reach?: number | null;
          avg_views?: number | null;
          created_at?: string;
          declared_by?: string | null;
          declared_side?: string;
          engagement_bp?: number | null;
          followers?: number | null;
          handle?: string;
          id?: string;
          network?: string;
          source?: string;
          talent_id?: string;
          updated_at?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "talent_social_accounts_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_social_accounts_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      media_kits: {
        Row: {
          about: string;
          agency_id: string;
          created_at: string;
          headline: string;
          id: string;
          last_viewed_at: string | null;
          share_created_at: string | null;
          share_created_by: string | null;
          share_expires_at: string | null;
          share_revoked_at: string | null;
          share_token_hash: string | null;
          talent_id: string;
          updated_at: string;
          updated_by: string | null;
          view_count: number;
          visible_fields: string[];
        };
        ComputedFields: never;
        Insert: {
          about?: string;
          agency_id: string;
          created_at?: string;
          headline?: string;
          id?: string;
          last_viewed_at?: string | null;
          share_created_at?: string | null;
          share_created_by?: string | null;
          share_expires_at?: string | null;
          share_revoked_at?: string | null;
          share_token_hash?: string | null;
          talent_id: string;
          updated_at?: string;
          updated_by?: string | null;
          view_count?: number;
          visible_fields?: string[];
        };
        Update: {
          about?: string;
          agency_id?: string;
          created_at?: string;
          headline?: string;
          id?: string;
          last_viewed_at?: string | null;
          share_created_at?: string | null;
          share_created_by?: string | null;
          share_expires_at?: string | null;
          share_revoked_at?: string | null;
          share_token_hash?: string | null;
          talent_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          view_count?: number;
          visible_fields?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "media_kits_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_kits_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      talent_availability: {
        Row: {
          agency_id: string;
          created_at: string;
          created_by: string | null;
          ends_on: string;
          id: string;
          kind: string;
          note: string;
          starts_on: string;
          talent_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          created_at?: string;
          created_by?: string | null;
          ends_on: string;
          id?: string;
          kind?: string;
          note?: string;
          starts_on: string;
          talent_id: string;
          updated_at?: string;
        };
        Update: {
          agency_id?: string;
          created_at?: string;
          created_by?: string | null;
          ends_on?: string;
          id?: string;
          kind?: string;
          note?: string;
          starts_on?: string;
          talent_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "talent_availability_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "talent_availability_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_requests: {
        Row: {
          agency_id: string;
          brand_id: string;
          created_at: string;
          created_by: string | null;
          decided_at: string | null;
          deliverables: NonNullable<Json>;
          desired_at: string | null;
          duration_minutes: number | null;
          format: string | null;
          id: string;
          location: string;
          networks: string[];
          notes: string;
          objective: string | null;
          origin: string;
          period_end: string | null;
          period_start: string | null;
          product: string;
          region_note: string;
          segment_ids: string[];
          status: string;
          submitted_at: string | null;
          talent_id: string | null;
          target_age_bands: string[];
          target_audience: string;
          target_states: string[];
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          decided_at?: string | null;
          deliverables?: NonNullable<Json>;
          desired_at?: string | null;
          duration_minutes?: number | null;
          format?: string | null;
          id?: string;
          location?: string;
          networks?: string[];
          notes?: string;
          objective?: string | null;
          origin: string;
          period_end?: string | null;
          period_start?: string | null;
          product?: string;
          region_note?: string;
          segment_ids?: string[];
          status?: string;
          submitted_at?: string | null;
          talent_id?: string | null;
          target_age_bands?: string[];
          target_audience?: string;
          target_states?: string[];
          title?: string;
          updated_at?: string;
        };
        Update: {
          agency_id?: string;
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          decided_at?: string | null;
          deliverables?: NonNullable<Json>;
          desired_at?: string | null;
          duration_minutes?: number | null;
          format?: string | null;
          id?: string;
          location?: string;
          networks?: string[];
          notes?: string;
          objective?: string | null;
          origin?: string;
          period_end?: string | null;
          period_start?: string | null;
          product?: string;
          region_note?: string;
          segment_ids?: string[];
          status?: string;
          submitted_at?: string | null;
          talent_id?: string | null;
          target_age_bands?: string[];
          target_audience?: string;
          target_states?: string[];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_requests_agency_brand_fk";
            columns: ["agency_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "agency_brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_requests_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_requests_brand_fk";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_requests_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      deals: {
        Row: {
          agency_id: string;
          brand_id: string;
          brand_visible: boolean;
          closed_at: string | null;
          confirmed_at: string | null;
          contract_confirmed_at: string | null;
          created_at: string;
          created_by: string | null;
          expected_end: string | null;
          expected_start: string | null;
          id: string;
          is_demo: boolean;
          outcome: string | null;
          owner_id: string | null;
          request_id: string | null;
          segment_ids: string[];
          service_rate_bp: number | null;
          stage: string;
          stage_changed_at: string;
          talent_brief: string;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          brand_id: string;
          brand_visible?: boolean;
          closed_at?: string | null;
          confirmed_at?: string | null;
          contract_confirmed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          expected_end?: string | null;
          expected_start?: string | null;
          id?: string;
          is_demo?: boolean;
          outcome?: string | null;
          owner_id?: string | null;
          request_id?: string | null;
          segment_ids?: string[];
          service_rate_bp?: number | null;
          stage?: string;
          stage_changed_at?: string;
          talent_brief?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          agency_id?: string;
          brand_id?: string;
          brand_visible?: boolean;
          closed_at?: string | null;
          confirmed_at?: string | null;
          contract_confirmed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          expected_end?: string | null;
          expected_start?: string | null;
          id?: string;
          is_demo?: boolean;
          outcome?: string | null;
          owner_id?: string | null;
          request_id?: string | null;
          segment_ids?: string[];
          service_rate_bp?: number | null;
          stage?: string;
          stage_changed_at?: string;
          talent_brief?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deals_agency_brand_fk";
            columns: ["agency_id", "brand_id"];
            isOneToOne: false;
            referencedRelation: "agency_brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_brand_fk";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_request_fk";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "campaign_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_team: {
        Row: {
          added_by: string | null;
          agency_id: string;
          created_at: string;
          deal_id: string;
          id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          added_by?: string | null;
          agency_id: string;
          created_at?: string;
          deal_id: string;
          id?: string;
          user_id: string;
        };
        Update: {
          added_by?: string | null;
          agency_id?: string;
          created_at?: string;
          deal_id?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deal_team_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_team_deal_fk";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_talents: {
        Row: {
          agency_id: string;
          consulted_at: string | null;
          consulted_by: string | null;
          created_at: string;
          deal_id: string;
          id: string;
          reasons: NonNullable<Json>;
          respond_by: string | null;
          responded_at: string | null;
          response_channel: string | null;
          response_note: string;
          status: string;
          suggested_by: string | null;
          talent_id: string;
          terms_ready: boolean;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          consulted_at?: string | null;
          consulted_by?: string | null;
          created_at?: string;
          deal_id: string;
          id?: string;
          reasons?: NonNullable<Json>;
          respond_by?: string | null;
          responded_at?: string | null;
          response_channel?: string | null;
          response_note?: string;
          status?: string;
          suggested_by?: string | null;
          talent_id: string;
          terms_ready?: boolean;
          updated_at?: string;
        };
        Update: {
          agency_id?: string;
          consulted_at?: string | null;
          consulted_by?: string | null;
          created_at?: string;
          deal_id?: string;
          id?: string;
          reasons?: NonNullable<Json>;
          respond_by?: string | null;
          responded_at?: string | null;
          response_channel?: string | null;
          response_note?: string;
          status?: string;
          suggested_by?: string | null;
          talent_id?: string;
          terms_ready?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deal_talents_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_talents_deal_fk";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_talents_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      deliverables: {
        Row: {
          agency_id: string;
          brand_feedback: string;
          brand_id: string;
          brief: string;
          created_at: string;
          created_by: string | null;
          deal_id: string;
          deal_talent_id: string;
          decided_at: string | null;
          decided_by: string | null;
          decided_side: string | null;
          due_at: string | null;
          id: string;
          kind: string;
          network: string | null;
          proof_at: string | null;
          proof_document_id: string | null;
          proof_url: string | null;
          publish_at: string | null;
          published_at: string | null;
          published_url: string | null;
          revision: number;
          status: string;
          submission_document_id: string | null;
          submission_note: string;
          submission_url: string | null;
          submitted_at: string | null;
          talent_id: string;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          brand_feedback?: string;
          brand_id: string;
          brief?: string;
          created_at?: string;
          created_by?: string | null;
          deal_id: string;
          deal_talent_id: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decided_side?: string | null;
          due_at?: string | null;
          id?: string;
          kind: string;
          network?: string | null;
          proof_at?: string | null;
          proof_document_id?: string | null;
          proof_url?: string | null;
          publish_at?: string | null;
          published_at?: string | null;
          published_url?: string | null;
          revision?: number;
          status?: string;
          submission_document_id?: string | null;
          submission_note?: string;
          submission_url?: string | null;
          submitted_at?: string | null;
          talent_id: string;
          title?: string;
          updated_at?: string;
        };
        Update: {
          agency_id?: string;
          brand_feedback?: string;
          brand_id?: string;
          brief?: string;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string;
          deal_talent_id?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decided_side?: string | null;
          due_at?: string | null;
          id?: string;
          kind?: string;
          network?: string | null;
          proof_at?: string | null;
          proof_document_id?: string | null;
          proof_url?: string | null;
          publish_at?: string | null;
          published_at?: string | null;
          published_url?: string | null;
          revision?: number;
          status?: string;
          submission_document_id?: string | null;
          submission_note?: string;
          submission_url?: string | null;
          submitted_at?: string | null;
          talent_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deliverables_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverables_brand_fk";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverables_deal_fk";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverables_deal_talent_fk";
            columns: ["deal_talent_id"];
            isOneToOne: false;
            referencedRelation: "deal_talents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverables_proof_doc_fk";
            columns: ["proof_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverables_submission_doc_fk";
            columns: ["submission_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverables_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      activities: {
        Row: {
          agency_id: string;
          author_id: string | null;
          author_label: string;
          body: string;
          created_at: string;
          deal_id: string | null;
          id: string;
          kind: string;
          occurred_at: string;
          reason_codes: string[];
          subject_brand_id: string | null;
          subject_type: string;
          talent_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          author_id?: string | null;
          author_label?: string;
          body?: string;
          created_at?: string;
          deal_id?: string | null;
          id?: string;
          kind: string;
          occurred_at?: string;
          reason_codes?: string[];
          subject_brand_id?: string | null;
          subject_type: string;
          talent_id?: string | null;
        };
        Update: {
          agency_id?: string;
          author_id?: string | null;
          author_label?: string;
          body?: string;
          created_at?: string;
          deal_id?: string | null;
          id?: string;
          kind?: string;
          occurred_at?: string;
          reason_codes?: string[];
          subject_brand_id?: string | null;
          subject_type?: string;
          talent_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "activities_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activities_brand_fk";
            columns: ["subject_brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activities_deal_fk";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activities_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_messages: {
        Row: {
          agency_id: string;
          author_id: string | null;
          author_label: string;
          author_side: string;
          body: string;
          brand_id: string;
          channel: string;
          created_at: string;
          deal_id: string;
          id: string;
          talent_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          author_id?: string | null;
          author_label: string;
          author_side: string;
          body: string;
          brand_id: string;
          channel: string;
          created_at?: string;
          deal_id: string;
          id?: string;
          talent_id?: string | null;
        };
        Update: {
          agency_id?: string;
          author_id?: string | null;
          author_label?: string;
          author_side?: string;
          body?: string;
          brand_id?: string;
          channel?: string;
          created_at?: string;
          deal_id?: string;
          id?: string;
          talent_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "deal_messages_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_messages_brand_fk";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_messages_deal_fk";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_messages_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      campaign_request_budgets: {
        Row: {
          agency_id: string;
          brand_id: string;
          budget_max_cents: number | null;
          budget_min_cents: number | null;
          created_at: string;
          id: string;
          note: string;
          request_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          brand_id: string;
          budget_max_cents?: number | null;
          budget_min_cents?: number | null;
          created_at?: string;
          id?: string;
          note?: string;
          request_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          agency_id?: string;
          brand_id?: string;
          budget_max_cents?: number | null;
          budget_min_cents?: number | null;
          created_at?: string;
          id?: string;
          note?: string;
          request_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "campaign_request_budgets_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_request_budgets_brand_fk";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "campaign_request_budgets_request_fk";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "campaign_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_talent_fees: {
        Row: {
          agency_id: string;
          created_at: string;
          currency: string;
          deal_id: string;
          deal_talent_id: string;
          fee_cents: number;
          id: string;
          set_at: string;
          set_by: string | null;
          talent_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          created_at?: string;
          currency?: string;
          deal_id: string;
          deal_talent_id: string;
          fee_cents: number;
          id?: string;
          set_at?: string;
          set_by?: string | null;
          talent_id: string;
          updated_at?: string;
        };
        Update: {
          agency_id?: string;
          created_at?: string;
          currency?: string;
          deal_id?: string;
          deal_talent_id?: string;
          fee_cents?: number;
          id?: string;
          set_at?: string;
          set_by?: string | null;
          talent_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deal_talent_fees_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_talent_fees_deal_fk";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_talent_fees_deal_talent_fk";
            columns: ["deal_talent_id"];
            isOneToOne: false;
            referencedRelation: "deal_talents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_talent_fees_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_events: {
        Row: {
          agency_id: string;
          all_day: boolean;
          brand_id: string | null;
          created_at: string;
          created_by: string | null;
          deal_id: string | null;
          deal_talent_id: string | null;
          deliverable_id: string | null;
          description: string;
          ends_at: string;
          id: string;
          kind: string;
          location: string;
          source: string;
          source_key: string | null;
          starts_at: string;
          subtitle: string;
          talent_id: string | null;
          title: string;
          updated_at: string;
          visible_to_brand: boolean;
          visible_to_talent: boolean;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          all_day?: boolean;
          brand_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          deal_talent_id?: string | null;
          deliverable_id?: string | null;
          description?: string;
          ends_at: string;
          id?: string;
          kind: string;
          location?: string;
          source?: string;
          source_key?: string | null;
          starts_at: string;
          subtitle?: string;
          talent_id?: string | null;
          title: string;
          updated_at?: string;
          visible_to_brand?: boolean;
          visible_to_talent?: boolean;
        };
        Update: {
          agency_id?: string;
          all_day?: boolean;
          brand_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          deal_talent_id?: string | null;
          deliverable_id?: string | null;
          description?: string;
          ends_at?: string;
          id?: string;
          kind?: string;
          location?: string;
          source?: string;
          source_key?: string | null;
          starts_at?: string;
          subtitle?: string;
          talent_id?: string | null;
          title?: string;
          updated_at?: string;
          visible_to_brand?: boolean;
          visible_to_talent?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_events_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_events_brand_fk";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_events_deal_fk";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_events_deal_talent_fk";
            columns: ["deal_talent_id"];
            isOneToOne: false;
            referencedRelation: "deal_talents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_events_deliverable_fk";
            columns: ["deliverable_id"];
            isOneToOne: false;
            referencedRelation: "deliverables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_events_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_feeds: {
        Row: {
          created_at: string;
          fetch_count: number;
          id: string;
          last_fetched_at: string | null;
          revoked_at: string | null;
          rotated_at: string;
          token_hash: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          fetch_count?: number;
          id?: string;
          last_fetched_at?: string | null;
          revoked_at?: string | null;
          rotated_at?: string;
          token_hash: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          fetch_count?: number;
          id?: string;
          last_fetched_at?: string | null;
          revoked_at?: string | null;
          rotated_at?: string;
          token_hash?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      deal_terms: {
        Row: {
          agency_id: string;
          brand_id: string;
          created_at: string;
          created_by: string | null;
          deal_id: string;
          exclusivity: string;
          id: string;
          sent_at: string | null;
          sent_by: string | null;
          status: string;
          summary: string;
          updated_at: string;
          usage_rights: string;
          valid_until: string | null;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          deal_id: string;
          exclusivity?: string;
          id?: string;
          sent_at?: string | null;
          sent_by?: string | null;
          status?: string;
          summary?: string;
          updated_at?: string;
          usage_rights?: string;
          valid_until?: string | null;
          version: number;
        };
        Update: {
          agency_id?: string;
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string;
          exclusivity?: string;
          id?: string;
          sent_at?: string | null;
          sent_by?: string | null;
          status?: string;
          summary?: string;
          updated_at?: string;
          usage_rights?: string;
          valid_until?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "deal_terms_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_terms_brand_fk";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_terms_deal_fk";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_acceptances: {
        Row: {
          accepted_at: string;
          accepted_by: string | null;
          agency_id: string;
          brand_id: string;
          deal_id: string;
          deal_talent_id: string | null;
          document_id: string | null;
          id: string;
          method: string;
          note: string;
          party: string;
          proposal_id: string | null;
          talent_id: string | null;
          terms_id: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string;
          accepted_by?: string | null;
          agency_id: string;
          brand_id: string;
          deal_id: string;
          deal_talent_id?: string | null;
          document_id?: string | null;
          id?: string;
          method: string;
          note?: string;
          party: string;
          proposal_id?: string | null;
          talent_id?: string | null;
          terms_id: string;
        };
        Update: {
          accepted_at?: string;
          accepted_by?: string | null;
          agency_id?: string;
          brand_id?: string;
          deal_id?: string;
          deal_talent_id?: string | null;
          document_id?: string | null;
          id?: string;
          method?: string;
          note?: string;
          party?: string;
          proposal_id?: string | null;
          talent_id?: string | null;
          terms_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deal_acceptances_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_acceptances_brand_fk";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_acceptances_deal_fk";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_acceptances_deal_talent_fk";
            columns: ["deal_talent_id"];
            isOneToOne: false;
            referencedRelation: "deal_talents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_acceptances_document_fk";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_acceptances_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_acceptances_terms_fk";
            columns: ["terms_id"];
            isOneToOne: false;
            referencedRelation: "deal_terms";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          agency_id: string;
          assignee_id: string | null;
          attachment_document_id: string | null;
          attachment_url: string | null;
          brand_id: string | null;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          created_by: string | null;
          deal_id: string | null;
          deliverable_id: string | null;
          description: string;
          due_at: string | null;
          feedback: string;
          id: string;
          scope_type: string;
          side: string;
          status: string;
          talent_id: string | null;
          template_step: number | null;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          assignee_id?: string | null;
          attachment_document_id?: string | null;
          attachment_url?: string | null;
          brand_id?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          deliverable_id?: string | null;
          description?: string;
          due_at?: string | null;
          feedback?: string;
          id?: string;
          scope_type: string;
          side?: string;
          status?: string;
          talent_id?: string | null;
          template_step?: number | null;
          title?: string;
          updated_at?: string;
        };
        Update: {
          agency_id?: string;
          assignee_id?: string | null;
          attachment_document_id?: string | null;
          attachment_url?: string | null;
          brand_id?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          deal_id?: string | null;
          deliverable_id?: string | null;
          description?: string;
          due_at?: string | null;
          feedback?: string;
          id?: string;
          scope_type?: string;
          side?: string;
          status?: string;
          talent_id?: string | null;
          template_step?: number | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_attachment_doc_fk";
            columns: ["attachment_document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_brand_fk";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_deal_fk";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_deliverable_fk";
            columns: ["deliverable_id"];
            isOneToOne: false;
            referencedRelation: "deliverables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      deliverable_versions: {
        Row: {
          agency_id: string;
          brand_id: string;
          deal_id: string;
          deal_talent_id: string;
          decided_at: string | null;
          decided_by: string | null;
          decided_side: string | null;
          decision: string | null;
          deliverable_id: string;
          document_id: string | null;
          feedback: string;
          id: string;
          kind: string;
          note: string;
          revision: number;
          submitted_at: string;
          submitted_by: string | null;
          submitted_side: string;
          talent_id: string;
          url: string | null;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          brand_id: string;
          deal_id: string;
          deal_talent_id: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decided_side?: string | null;
          decision?: string | null;
          deliverable_id: string;
          document_id?: string | null;
          feedback?: string;
          id?: string;
          kind: string;
          note?: string;
          revision: number;
          submitted_at?: string;
          submitted_by?: string | null;
          submitted_side: string;
          talent_id: string;
          url?: string | null;
        };
        Update: {
          agency_id?: string;
          brand_id?: string;
          deal_id?: string;
          deal_talent_id?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decided_side?: string | null;
          decision?: string | null;
          deliverable_id?: string;
          document_id?: string | null;
          feedback?: string;
          id?: string;
          kind?: string;
          note?: string;
          revision?: number;
          submitted_at?: string;
          submitted_by?: string | null;
          submitted_side?: string;
          talent_id?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "deliverable_versions_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverable_versions_brand_fk";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverable_versions_deal_fk";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverable_versions_deal_talent_fk";
            columns: ["deal_talent_id"];
            isOneToOne: false;
            referencedRelation: "deal_talents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverable_versions_deliverable_fk";
            columns: ["deliverable_id"];
            isOneToOne: false;
            referencedRelation: "deliverables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverable_versions_document_fk";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliverable_versions_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      financial_entries: {
        Row: {
          agency_id: string;
          amount_cents: number;
          brand_id: string;
          created_at: string;
          created_by: string | null;
          currency: string;
          deal_id: string;
          deal_talent_id: string | null;
          due_on: string | null;
          id: string;
          kind: string;
          note: string;
          rate_bp: number;
          settled_at: string | null;
          settled_by: string | null;
          simulated: boolean;
          status: string;
          talent_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          agency_id: string;
          amount_cents: number;
          brand_id: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deal_id: string;
          deal_talent_id?: string | null;
          due_on?: string | null;
          id?: string;
          kind: string;
          note?: string;
          rate_bp: number;
          settled_at?: string | null;
          settled_by?: string | null;
          simulated?: boolean;
          status?: string;
          talent_id?: string | null;
          updated_at?: string;
        };
        Update: {
          agency_id?: string;
          amount_cents?: number;
          brand_id?: string;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          deal_id?: string;
          deal_talent_id?: string | null;
          due_on?: string | null;
          id?: string;
          kind?: string;
          note?: string;
          rate_bp?: number;
          settled_at?: string | null;
          settled_by?: string | null;
          simulated?: boolean;
          status?: string;
          talent_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "financial_entries_agency_fk";
            columns: ["agency_id"];
            isOneToOne: false;
            referencedRelation: "agencies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_entries_brand_fk";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_entries_deal_fk";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "deals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_entries_deal_talent_fk";
            columns: ["deal_talent_id"];
            isOneToOne: false;
            referencedRelation: "deal_talents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_entries_talent_fk";
            columns: ["talent_id"];
            isOneToOne: false;
            referencedRelation: "talent_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
"post_blocks": {
                  Row: {
                    "content_id": string,"created_at": string,"data": NonNullable<Json>,"kind": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id": string,"created_at"?: string,"data": NonNullable<Json>,"kind": string,"updated_at"?: string
                  }
                  Update: {
                    "content_id"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"kind"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_blocks_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                };
"post_step_checks": {
                  Row: {
                    "checked_at": string,"content_id": string,"step_index": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_at"?: string,"content_id": string,"step_index": number,"user_id": string
                  }
                  Update: {
                    "checked_at"?: string,"content_id"?: string,"step_index"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_step_checks_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
"post_block_uuid_ok":
{ Args: { "p": Json }; Returns: boolean
                           };
      post_block_data_ok: { Args: { p_data: Json; p_kind: string }; Returns: boolean };
      post_step_toggle: { Args: { p_content: string; p_done?: boolean | null; p_step: number }; Returns: number };
      post_block_set: { Args: { p_content: string; p_data: Json | null; p_kind: string | null }; Returns: undefined };
      collectible_photo_upload_claim: { Args: { p_bytes: number; p_mime: string }; Returns: string };
      agency_audit_list: {
        Args: {
          p_agency: string;
          p_before?: string | null;
          p_limit?: number | null;
        };
        Returns: {
          id: number;
          action: string;
          resource_type: string;
          resource_id: string;
          actor_type: string;
          justification: string;
          created_at: string;
        }[];
      };
      talent_payouts: { Args: Record<PropertyKey, never>; Returns: Json };
      agency_rates: {
        Args: { p_agency: string; p_deal?: string | null };
        Returns: Json;
      };
      agency_publish_sponsorship: {
        Args: { p_deal_talent: string };
        Returns: boolean;
      };
      documents_orphans_purge: { Args: { p_paths: string[] }; Returns: number };
      documents_orphans: {
        Args: { p_limit?: number | null };
        Returns: string[];
      };
      inbox_cleanup: { Args: Record<PropertyKey, never>; Returns: number };
      agency_relationship_scan: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      talent_office_summary: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      brand_dashboard: { Args: { p_brand: string }; Returns: Json };
      agency_dashboard: { Args: { p_agency: string }; Returns: Json };
      agency_finance_summary: { Args: { p_agency: string }; Returns: Json };
      agency_deal_rate_set: {
        Args: { p_deal: string; p_rate_bp?: number | null };
        Returns: undefined;
      };
      agency_rate_set: {
        Args: { p_agency: string; p_rate_bp: number };
        Returns: undefined;
      };
      agency_entry_set_status: {
        Args: { p_entry: string; p_note?: string | null; p_status: string };
        Returns: undefined;
      };
      agency_finance_backfill: {
        Args: { p_agency?: string | null };
        Returns: number;
      };
      task_template_steps: {
        Args: Record<PropertyKey, never>;
        Returns: {
          step: number;
          side: string;
          per_talent: boolean;
          anchor: string;
          days: number;
        }[];
      };
      agency_demo_seed_execution: {
        Args: { p_actor: string; p_agency: string };
        Returns: undefined;
      };
      deal_execution: { Args: { p_deal: string }; Returns: Json };
      agency_deliverable_close: {
        Args: {
          p_deliverable: string;
          p_note?: string | null;
          p_status: string;
        };
        Returns: undefined;
      };
      deliverable_proof: {
        Args: {
          p_deliverable: string;
          p_document?: string | null;
          p_url?: string | null;
        };
        Returns: string;
      };
      deliverable_publish: {
        Args: { p_deliverable: string; p_url: string };
        Returns: undefined;
      };
      deliverable_decide: {
        Args: {
          p_decision: string;
          p_deliverable: string;
          p_feedback?: string | null;
        };
        Returns: undefined;
      };
      deliverable_submit: {
        Args: {
          p_deliverable: string;
          p_document?: string | null;
          p_note?: string | null;
          p_url?: string | null;
        };
        Returns: string;
      };
      brand_task_decide: {
        Args: {
          p_decision: string;
          p_feedback?: string | null;
          p_task: string;
        };
        Returns: undefined;
      };
      task_set_status: {
        Args: { p_attachment?: Json | null; p_status: string; p_task: string };
        Returns: undefined;
      };
      task_save: {
        Args: { p_data: Json; p_id: string | null };
        Returns: string;
      };
      agency_contract_confirm: { Args: { p_deal: string }; Returns: number };
      agency_record_acceptance: {
        Args: {
          p_deal_talent?: string | null;
          p_document?: string | null;
          p_note?: string | null;
          p_party: string;
          p_terms: string;
        };
        Returns: undefined;
      };
      talent_terms_accept: {
        Args: { p_note?: string | null; p_terms: string };
        Returns: undefined;
      };
      brand_terms_accept: {
        Args: { p_note?: string | null; p_terms: string };
        Returns: undefined;
      };
      agency_terms_withdraw: { Args: { p_terms: string }; Returns: undefined };
      agency_terms_send: { Args: { p_terms: string }; Returns: undefined };
      agency_terms_save: {
        Args: { p_data: Json; p_deal: string };
        Returns: string;
      };
      agency_demo_seed_calendar: {
        Args: { p_actor: string; p_agency: string };
        Returns: undefined;
      };
      calendar_feed_resolve: { Args: { p_token: string }; Returns: Json };
      calendar_feed_revoke: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      calendar_feed_create: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      agency_event_delete: { Args: { p_id: string }; Returns: undefined };
      agency_event_save: {
        Args: { p_agency: string; p_data: Json; p_id: string | null };
        Returns: string;
      };
      my_brand_deal_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      my_staff_deal_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      deal_stage_can: {
        Args: {
          p_from: string;
          p_is_owner: boolean;
          p_role: string;
          p_to: string;
        };
        Returns: boolean;
      };
      deal_brand_status: {
        Args: { p_outcome: string; p_stage: string };
        Returns: string;
      };
      talent_opportunities: {
        Args: { p_deal_talent?: string | null };
        Returns: Json;
      };
      brand_campaign_detail: { Args: { p_request: string }; Returns: Json };
      brand_campaigns: { Args: { p_brand: string }; Returns: Json };
      brand_talent_detail: {
        Args: { p_brand: string; p_talent: string };
        Returns: Json;
      };
      brand_talent_search: {
        Args: { p_brand: string; p_filters?: Json | null };
        Returns: Json;
      };
      talent_availability_delete: {
        Args: { p_id: string };
        Returns: undefined;
      };
      talent_availability_save: {
        Args: { p_data: Json; p_id: string | null; p_talent: string };
        Returns: string;
      };
      agency_deal_confirm: {
        Args: {
          p_deal: string;
          p_force?: boolean | null;
          p_note?: string | null;
        };
        Returns: undefined;
      };
      agency_deal_talent_set_status: {
        Args: { p_deal_talent: string; p_status: string };
        Returns: undefined;
      };
      agency_record_talent_response: {
        Args: {
          p_deal_talent: string;
          p_document?: string | null;
          p_note: string;
          p_response: string;
        };
        Returns: undefined;
      };
      talent_opportunity_respond: {
        Args: {
          p_deal_talent: string;
          p_note?: string | null;
          p_response: string;
        };
        Returns: undefined;
      };
      agency_consult_talents: {
        Args: {
          p_deal: string;
          p_deal_talent_ids: string[];
          p_message?: string | null;
          p_respond_by: string;
        };
        Returns: number;
      };
      agency_deliverables_save: {
        Args: { p_deal: string; p_items: Json };
        Returns: undefined;
      };
      agency_fee_set: {
        Args: { p_deal_talent: string; p_fee_cents: number };
        Returns: undefined;
      };
      deal_message_post: {
        Args: {
          p_body: string;
          p_channel: string;
          p_deal: string;
          p_talent: string | null;
        };
        Returns: string;
      };
      agency_activity_add: {
        Args: {
          p_body: string;
          p_kind: string;
          p_occurred_at?: string | null;
          p_subject_id: string;
          p_subject_type: string;
        };
        Returns: string;
      };
      agency_shortlist_set: {
        Args: { p_deal: string; p_items: Json };
        Returns: undefined;
      };
      agency_deal_move: {
        Args: {
          p_deal: string;
          p_force?: boolean | null;
          p_note?: string | null;
          p_outcome?: string | null;
          p_to: string;
        };
        Returns: undefined;
      };
      agency_deal_team_set: {
        Args: { p_deal: string; p_user_ids: string[] };
        Returns: undefined;
      };
      agency_deal_update: {
        Args: { p_data: Json; p_deal: string };
        Returns: undefined;
      };
      agency_deal_create: {
        Args: { p_agency: string; p_brand: string; p_data: Json };
        Returns: string;
      };
      brand_request_cancel: {
        Args: { p_id: string; p_note: string };
        Returns: undefined;
      };
      brand_request_submit: { Args: { p_id: string }; Returns: string };
      brand_request_save: {
        Args: { p_brand: string; p_data: Json; p_id: string | null };
        Returns: string;
      };
      talent_audience_ok: { Args: { p: Json }; Returns: boolean };
      my_talent_agency_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      my_talent_id: { Args: Record<PropertyKey, never>; Returns: string };
      talent_my_context: { Args: Record<PropertyKey, never>; Returns: Json };
      media_kit_resolve: {
        Args: { p_count?: boolean | null; p_token: string };
        Returns: Json;
      };
      media_kit_revoke: { Args: { p_talent: string }; Returns: undefined };
      media_kit_share: {
        Args: { p_days?: number | null; p_talent: string };
        Returns: string;
      };
      media_kit_save: {
        Args: { p_data: Json; p_talent: string };
        Returns: undefined;
      };
      talent_social_delete: { Args: { p_id: string }; Returns: undefined };
      talent_social_save: {
        Args: { p_data: Json; p_id: string | null; p_talent: string };
        Returns: string;
      };
      agency_talent_set_catalog: {
        Args: { p_talent: string; p_visible: boolean };
        Returns: undefined;
      };
      agency_talent_record_consent: {
        Args: { p_document: string; p_talent: string; p_version: string };
        Returns: undefined;
      };
      talent_set_consent: {
        Args: { p_on: boolean; p_version: string | null };
        Returns: undefined;
      };
      agency_invite_talent: {
        Args: { p_days?: number | null; p_email: string; p_talent: string };
        Returns: {
          invitation_id: string;
          token: string;
        }[];
      };
      agency_talent_archive: {
        Args: { p_justification: string; p_talent: string };
        Returns: undefined;
      };
      agency_talent_link_creator: {
        Args: { p_creator: string | null; p_talent: string };
        Returns: undefined;
      };
      agency_talent_set_segments: {
        Args: { p_segment_ids: string[]; p_talent: string };
        Returns: undefined;
      };
      agency_talent_save: {
        Args: { p_agency: string; p_data: Json; p_id: string | null };
        Returns: string;
      };
      agency_demo_seed: {
        Args: { p_actor: string; p_agency: string; p_emails: Json };
        Returns: Json;
      };
      admin_agency_save: {
        Args: { p_data: Json; p_id: string | null };
        Returns: string;
      };
      document_set_sharing: {
        Args: { p_id: string; p_share_brand: boolean; p_share_talent: boolean };
        Returns: undefined;
      };
      document_archive: {
        Args: { p_id: string; p_reason?: string | null };
        Returns: undefined;
      };
      document_confirm: { Args: { p_id: string }; Returns: undefined };
      document_reserve: {
        Args: {
          p_agency: string;
          p_meta: Json;
          p_scope_id: string;
          p_scope_type: string;
        };
        Returns: Json;
      };
      agency_invitation_revoke: {
        Args: { p_id: string; p_justification?: string | null };
        Returns: undefined;
      };
      brand_member_remove: {
        Args: { p_brand: string; p_user: string };
        Returns: undefined;
      };
      brand_invite_member: {
        Args: { p_brand: string; p_days?: number | null; p_email: string };
        Returns: {
          invitation_id: string;
          token: string;
        }[];
      };
      agency_invite_brand_member: {
        Args: {
          p_agency: string;
          p_brand: string;
          p_days?: number | null;
          p_email: string;
          p_role: string;
        };
        Returns: {
          invitation_id: string;
          token: string;
        }[];
      };
      agency_brand_link: {
        Args: {
          p_account_manager?: string | null;
          p_agency: string;
          p_brand: string;
          p_on: boolean;
        };
        Returns: undefined;
      };
      agency_brand_create: {
        Args: { p_agency: string; p_data: Json };
        Returns: string;
      };
      agency_settings_save: {
        Args: { p_agency: string; p_data: Json };
        Returns: undefined;
      };
      agency_member_update_self: {
        Args: { p_display_name: string; p_job_title: string };
        Returns: undefined;
      };
      agency_member_remove: {
        Args: { p_agency: string; p_justification: string; p_user: string };
        Returns: undefined;
      };
      agency_member_set_role: {
        Args: {
          p_agency: string;
          p_justification: string;
          p_role: string;
          p_user: string;
        };
        Returns: undefined;
      };
      agency_invite_member: {
        Args: {
          p_agency: string;
          p_days?: number | null;
          p_email: string;
          p_role: string;
        };
        Returns: {
          invitation_id: string;
          token: string;
        }[];
      };
      inbox_mark_read: { Args: { p_ids?: string[] | null }; Returns: number };
      brand_active_agency: { Args: { p_brand: string }; Returns: string };
      my_brand_agency_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      my_agency_brand_ids: {
        Args: { p_active_only?: boolean | null };
        Returns: string[];
      };
      my_brand_ids: {
        Args: { p_owner_only?: boolean | null };
        Returns: string[];
      };
      brand_member_of: { Args: { p_brand: string }; Returns: string };
      my_agency_ids: { Args: { p_min?: string | null }; Returns: string[] };
      is_agency_admin: { Args: { p_agency: string }; Returns: boolean };
      agency_is_demo: { Args: { p_agency: string }; Returns: boolean };
      agency_can: {
        Args: { p_agency: string; p_min: string };
        Returns: boolean;
      };
      agency_role_of: { Args: { p_agency: string }; Returns: string };
      is_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_demo_account: { Args: Record<PropertyKey, never>; Returns: boolean };
      accept_invitation: { Args: { p_token: string }; Returns: Json };
      accept_my_invitations: { Args: Record<PropertyKey, never>; Returns: Json };
      accept_partner_terms: { Args: { p_version: string }; Returns: undefined };
      admin_resolve_report: { Args: { p_archive_content: boolean; p_id: string; p_status: string; p_suspend_creator: boolean }; Returns: undefined };
      block_hero: { Args: { p_creator: string }; Returns: undefined };
      unblock_hero: { Args: { p_creator: string }; Returns: undefined };
      is_blocked_creator: { Args: { p_creator: string }; Returns: boolean };
      my_blocked_heroes: {
        Args: Record<PropertyKey, never>;
        Returns: { avatar_url: string | null; blocked_at: string; id: string; name: string; slug: string }[];
      };
      report_content: { Args: { p_content: string | null; p_creator: string | null; p_details: string; p_reason: string }; Returns: string };
      agency_act_as_hero: { Args: { p_creator: string }; Returns: Json };
      agency_create_hero: {
        Args: { p_agency: string; p_bio: string; p_headline: string; p_name: string; p_pillars: Database["public"]["Enums"]["pillar"][]; p_slug: string };
        Returns: string;
      };
      agency_hero_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      agency_update_hero: {
        Args: { p_bio: string; p_creator: string; p_headline: string; p_name: string; p_pillars: Database["public"]["Enums"]["pillar"][] };
        Returns: undefined;
      };
      hero_avatar_clear: { Args: Record<PropertyKey, never>; Returns: string };
      hero_avatar_set: { Args: { p_url: string }; Returns: string };
      confirm_upload_rights: { Args: { p_version: string }; Returns: undefined };
      acting_hero_id: { Args: Record<PropertyKey, never>; Returns: string };
      admin_act_as_hero: { Args: { p_creator: string }; Returns: Json };
      admin_advance_transport: {
        Args: { p_minutes?: number };
        Returns: number;
      };
      admin_collectible_cancel: {
        Args: { p_id: string; p_reason: string };
        Returns: undefined;
      };
      admin_collectible_launch: {
        Args: { p_id: string; p_starts_at?: string };
        Returns: Json;
      };
      admin_collectible_save: {
        Args: { p_data: Json; p_id: string | null };
        Returns: string;
      };
      admin_collectible_set_contact: {
        Args: { p_id: string; p_status: string };
        Returns: string;
      };
      admin_create_invitation: {
        Args: {
          p_creator_profile_id?: string;
          p_days?: number;
          p_email: string;
          p_role: Database["public"]["Enums"]["app_role"];
          p_seller_org_id?: string;
        };
        Returns: {
          invitation_id: string;
          token: string;
        }[];
      };
      admin_create_program_version: {
        Args: { p_copy_from?: string; p_program: string };
        Returns: string;
      };
      admin_get_user: {
        Args: { p_id: string };
        Returns: {
          anonymized: boolean;
          avatar_url: string;
          banned_until: string;
          created_at: string;
          display_name: string;
          email: string;
          id: string;
          last_sign_in_at: string;
          locale: Database["public"]["Enums"]["locale_code"];
          roles: Json;
          timezone: string;
        }[];
      };
      admin_list_admins: {
        Args: Record<PropertyKey, never>;
        Returns: {
          display_name: string;
          email: string;
          id: string;
        }[];
      };
      admin_list_users: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string };
        Returns: {
          anonymized: boolean;
          created_at: string;
          display_name: string;
          email: string;
          id: string;
          last_sign_in_at: string;
          roles: string[];
        }[];
      };
      admin_log_account_status: {
        Args: { p_justification: string; p_suspended: boolean; p_user: string };
        Returns: undefined;
      };
      admin_indicators_collectibles: {
        Args: { p_days?: number };
        Returns: Json;
      };
      admin_indicators_conversion: { Args: { p_days?: number }; Returns: Json };
      admin_indicators_heroes: { Args: { p_days?: number }; Returns: Json };
      admin_indicators_professionals: {
        Args: { p_days?: number };
        Returns: Json;
      };
      admin_indicators_ranking: { Args: { p_days?: number }; Returns: Json };
      admin_indicators_shortcuts: { Args: { p_days?: number }; Returns: Json };
      admin_metrics: { Args: { p_days?: number }; Returns: Json };
      admin_moderate_product: {
        Args: { p_action: string; p_product: string; p_reason?: string };
        Returns: undefined;
      };
      admin_moderate_recipe_comment: {
        Args: { p_comment: string; p_decision: string; p_reason: string };
        Returns: undefined;
      };
      admin_publish_program_version: {
        Args: { p_version: string };
        Returns: undefined;
      };
      admin_review_content:
        | {
            Args: {
              p_content: string;
              p_decision: Database["public"]["Enums"]["review_status"];
              p_feedback?: string;
            };
            Returns: undefined;
          }
        | {
            Args: {
              p_content: string;
              p_decision: Database["public"]["Enums"]["review_status"];
              p_feedback: string;
              p_publish_at: string;
            };
            Returns: undefined;
          };
      admin_revoke_invitation: {
        Args: { p_id: string; p_justification?: string };
        Returns: undefined;
      };
      admin_revoke_membership: {
        Args: { p_justification?: string; p_membership: string };
        Returns: undefined;
      };
      admin_run_retention: { Args: Record<PropertyKey, never>; Returns: Json };
      admin_set_category_library_tabs: {
        Args: { p_category: string; p_rows: Json };
        Returns: undefined;
      };
      admin_set_content_status:
        | {
            Args: {
              p_content: string;
              p_justification?: string;
              p_status: Database["public"]["Enums"]["content_status"];
            };
            Returns: undefined;
          }
        | {
            Args: {
              p_content: string;
              p_justification: string;
              p_publish_at: string;
              p_status: Database["public"]["Enums"]["content_status"];
            };
            Returns: undefined;
          };
      admin_set_creator_credentials: {
        Args: {
          p_approved: boolean;
          p_creator: string;
          p_expected_text?: string;
          p_reason: string;
        };
        Returns: undefined;
      };
      admin_set_creator_library_overrides: {
        Args: { p_creator: string; p_rows: Json };
        Returns: undefined;
      };
      admin_set_creator_product: {
        Args: {
          p_creator: string;
          p_note?: string;
          p_product: string;
          p_sort?: number;
          p_status: Database["public"]["Enums"]["link_status"];
        };
        Returns: string;
      };
      admin_set_creator_recipe: {
        Args: {
          p_content: string;
          p_creator: string;
          p_sort?: number;
          p_status: Database["public"]["Enums"]["link_status"];
        };
        Returns: string;
      };
      admin_set_creator_rights_private: {
        Args: {
          p_creator: string;
          p_document_ref: string;
          p_justification?: string;
          p_notes: string;
        };
        Returns: undefined;
      };
      admin_set_creator_categories: {
        Args: { p_categories: string[]; p_creator: string };
        Returns: undefined;
      };
      admin_set_creator_status: {
        Args: {
          p_creator: string;
          p_justification?: string;
          p_status: Database["public"]["Enums"]["partner_status"];
        };
        Returns: undefined;
      };
      admin_set_featured: {
        Args: {
          p_featured: boolean;
          p_id: string;
          p_kind: string;
          p_rank?: number;
        };
        Returns: undefined;
      };
      admin_set_ingredient_product: {
        Args: {
          p_link: string;
          p_note: string;
          p_status: Database["public"]["Enums"]["link_status"];
        };
        Returns: undefined;
      };
      admin_set_link_status: {
        Args: {
          p_link: string;
          p_note?: string;
          p_status: Database["public"]["Enums"]["link_status"];
        };
        Returns: undefined;
      };
      admin_set_review_required: {
        Args: {
          p_on: boolean;
          p_reason: string;
          p_type: Database["public"]["Enums"]["content_type"];
        };
        Returns: undefined;
      };
      admin_set_role: {
        Args: {
          p_active: boolean;
          p_justification?: string;
          p_role: Database["public"]["Enums"]["app_role"];
          p_user: string;
        };
        Returns: undefined;
      };
      admin_set_seller_status: {
        Args: {
          p_justification?: string;
          p_org: string;
          p_status: Database["public"]["Enums"]["partner_status"];
        };
        Returns: undefined;
      };
      admin_set_setting: {
        Args: { p_justification?: string; p_key: string; p_value: Json };
        Returns: undefined;
      };
      admin_substitute_program_item: {
        Args: {
          p_original: string;
          p_reason: string;
          p_replacement: string;
          p_version: string;
        };
        Returns: undefined;
      };
      admin_triage_feedback: {
        Args: { p_id: string; p_justification?: string; p_patch: Json };
        Returns: Json;
      };
      admin_upsert_recipe_category: {
        Args: {
          p_active: boolean;
          p_code: string;
          p_name: Json;
          p_sort: number;
        };
        Returns: undefined;
      };
      admin_user_emails: {
        Args: { p_ids: string[] };
        Returns: {
          display_name: string;
          email: string;
          id: string;
        }[];
      };
      admin_validate_recipe_nutrition: {
        Args: {
          p_at: string;
          p_by: string;
          p_content: string;
          p_note: string;
          p_validated: boolean;
        };
        Returns: undefined;
      };
      advance_simulated_transport: {
        Args: { p_minutes_per_step?: number };
        Returns: number;
      };
      anonymize_user_data: { Args: { p_user: string }; Returns: undefined };
      audit_actor: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["actor_type"];
      };
      audit_log: {
        Args: {
          p_action: string;
          p_actor_type?: Database["public"]["Enums"]["actor_type"];
          p_after?: Json;
          p_before?: Json;
          p_justification?: string;
          p_resource_id: string;
          p_resource_type: string;
        };
        Returns: undefined;
      };
      avatar_orphan_uploads: { Args: { p_limit: number }; Returns: string[] };
      avatar_set_photo: { Args: { p_url: string }; Returns: string[] };
      avatar_upload_claim: {
        Args: { p_bytes: number; p_mime: string };
        Returns: string;
      };
      can_access_content: { Args: { p_content: string }; Returns: boolean };
      cancel_subscription: { Args: Record<PropertyKey, never>; Returns: Json };
      cancel_test_order: { Args: { p_order: string }; Returns: undefined };
      cart_set_item: {
        Args: { p_product: string; p_quantity: number };
        Returns: undefined;
      };
      cart_validate: { Args: { p_expected?: Json }; Returns: Json };
      check_program_completion: {
        Args: { p_enrollment: string };
        Returns: Json;
      };
      checkout_cart: {
        Args: {
          p_accept_changes?: boolean;
          p_destination: string;
          p_expected?: Json;
        };
        Returns: string;
      };
      checkout_create_fulfillment: {
        Args: {
          p_eta: number;
          p_order: string;
          p_seller: string;
          p_seller_name: string;
          p_shipping_share: number;
          p_user: string;
          p_zone: string;
        };
        Returns: string;
      };
      collectible_finalize: { Args: { p_collectible: string }; Returns: Json };
      collectible_finalize_due: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      collectible_finalize_row: {
        Args: { p_collectible: string };
        Returns: boolean;
      };
      collectible_mask_label: { Args: { p_name: string }; Returns: string };
      collectible_phase: {
        Args: { p_ends: string; p_starts: string; p_status: string };
        Returns: string;
      };
      complete_content: {
        Args: { p_content: string; p_source?: string; p_timezone: string };
        Returns: Json;
      };
      compute_streak: {
        Args: { p_timezone?: string; p_user: string };
        Returns: number;
      };
      content_assert_media_license: {
        Args: { p_content: string };
        Returns: undefined;
      };
      content_is_live: {
        Args: {
          p_publish_at: string;
          p_status: Database["public"]["Enums"]["content_status"];
        };
        Returns: boolean;
      };
      content_localized_body: {
        Args: {
          p_content: string;
          p_locale: Database["public"]["Enums"]["locale_code"];
        };
        Returns: Json;
      };
      content_review_required: {
        Args: { p_type: Database["public"]["Enums"]["content_type"] };
        Returns: boolean;
      };
      creator_archive_content: {
        Args: { p_content: string; p_reason: string };
        Returns: Json;
      };
      creator_delete_recipe: { Args: { p_content: string }; Returns: Json };
      creator_delete_recipe_draft: {
        Args: { p_content: string };
        Returns: Json;
      };
      creator_discard_photo_draft: {
        Args: { p_content: string };
        Returns: Json;
      };
      creator_discard_video_draft: {
        Args: { p_content: string };
        Returns: Json;
      };
      creator_duplicate_recipe: {
        Args: { p_content: string; p_slug: string; p_title: string };
        Returns: string;
      };
      creator_publish_content:
        | { Args: { p_content: string }; Returns: Json }
        | { Args: { p_content: string; p_publish_at: string }; Returns: Json };
      creator_recipe_stats: {
        Args: { p_days?: number };
        Returns: {
          content_id: string;
          favorites: number;
          rating_avg: number;
          rating_count: number;
          visitors: number;
        }[];
      };
      creator_restore_content: { Args: { p_content: string }; Returns: Json };
      creator_restore_recipe_version: {
        Args: { p_version: string };
        Returns: Json;
      };
      creator_set_draft_slug: {
        Args: { p_content: string; p_slug: string };
        Returns: Json;
      };
      creator_suggest_ingredient_product: {
        Args: { p_ingredient: string; p_note: string; p_product: string };
        Returns: string;
      };
      creator_unpublish_content: { Args: { p_content: string }; Returns: Json };
      creator_withdraw_ingredient_product: {
        Args: { p_link: string };
        Returns: undefined;
      };
      creator_withdraw_review: { Args: { p_content: string }; Returns: Json };
      delete_my_account: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      enroll_program: {
        Args: { p_program: string; p_timezone?: string };
        Returns: string;
      };
      evaluate_achievements: {
        Args: { p_timezone?: string; p_user: string };
        Returns: string[];
      };
      explore_feed: {
        Args: {
          p_access?: Database["public"]["Enums"]["access_level"];
          p_difficulty?: string;
          p_limit?: number;
          p_offset?: number;
          p_pillar?: Database["public"]["Enums"]["pillar"];
          p_seed?: number;
          p_type?: Database["public"]["Enums"]["content_type"];
        };
        Returns: {
          access_level: Database["public"]["Enums"]["access_level"] | null;
          archived_at: string | null;
          archived_by: string | null;
          completion_mode:
            | Database["public"]["Enums"]["completion_mode"]
            | null;
          cover_url: string | null;
          created_at: string;
          created_by: string | null;
          creator_id: string | null;
          creator_link_origin: string | null;
          difficulty: string | null;
          disclaimer_kind: string | null;
          duration_minutes: number | null;
          featured_rank: number | null;
          has_captions: boolean;
          id: string;
          is_featured: boolean;
          media_credit: string | null;
          media_license_kind: string;
          media_license_ref: string | null;
          pillar: Database["public"]["Enums"]["pillar"];
          publish_at: string | null;
          published_at: string | null;
          required_module_id: string | null;
          review_status: Database["public"]["Enums"]["review_status"];
          search: unknown;
          slug: string;
          source_locale: Database["public"]["Enums"]["locale_code"];
          status: Database["public"]["Enums"]["content_status"];
          summary: string | null;
          tags: string[];
          title: string;
          type: Database["public"]["Enums"]["content_type"];
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "content";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      f_unaccent: { Args: { "": string }; Returns: string };
      fulfillment_transition: {
        Args: {
          p_fulfillment: string;
          p_note?: string;
          p_to: Database["public"]["Enums"]["fulfillment_status"];
        };
        Returns: undefined;
      };
      has_role: {
        Args: { p_role: Database["public"]["Enums"]["app_role"] };
        Returns: boolean;
      };
      health_consent_grant: {
        Args: {
          p_age_confirmed: boolean;
          p_categories: string[];
          p_locale: string;
          p_version: string;
        };
        Returns: Json;
      };
      health_consent_reduce: {
        Args: { p_categories: string[] };
        Returns: Json;
      };
      health_consent_revoke: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      health_consent_text: { Args: { p_locale: string }; Returns: Json };
      health_run_retention: { Args: Record<PropertyKey, never>; Returns: Json };
      hero_cover_active_creator: { Args: { p_uid: string }; Returns: string };
      hero_cover_clear: { Args: Record<PropertyKey, never>; Returns: string };
      hero_cover_orphan_uploads: {
        Args: { p_limit: number };
        Returns: string[];
      };
      hero_cover_set: { Args: { p_url: string }; Returns: string };
      hero_cover_upload_claim: {
        Args: { p_bytes: number; p_mime: string };
        Returns: string;
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_seller_of: { Args: { p_org: string }; Returns: boolean };
      is_trusted_call: { Args: Record<PropertyKey, never>; Returns: boolean };
      local_date_for: { Args: { p_timezone: string }; Returns: string };
      media_license_compatible: {
        Args: {
          p_kind: string;
          p_provider: Database["public"]["Enums"]["media_provider"];
        };
        Returns: boolean;
      };
      my_creator_id: { Args: Record<PropertyKey, never>; Returns: string };
      my_entitled_modules: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      my_health_consent: { Args: Record<PropertyKey, never>; Returns: Json };
      my_health_today: {
        Args: { p_days?: number; p_until: string };
        Returns: Json;
      };
      my_roles: { Args: Record<PropertyKey, never>; Returns: Json };
      my_seller_org_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      my_subscription: { Args: Record<PropertyKey, never>; Returns: Json };
      my_wearable_connections: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      my_professional_id: { Args: Record<PropertyKey, never>; Returns: string };
      professional_save_profile: { Args: { p_data: Json }; Returns: undefined };
      professional_save_service: {
        Args: { p_data: Json; p_id: string | null };
        Returns: string;
      };
      service_order_can: {
        Args: { p_actor: string; p_from: string; p_to: string };
        Returns: boolean;
      };
      service_order_update: {
        Args: { p_note?: string; p_order: string; p_to?: string };
        Returns: string;
      };
      service_is_hireable: { Args: { p_service: string }; Returns: boolean };
      service_cart_set: {
        Args: { p_add: boolean; p_service: string };
        Returns: number;
      };
      checkout_with_services: {
        Args: {
          p_accept_changes?: boolean;
          p_destination?: string;
          p_expected?: Json;
          p_services?: Json;
        };
        Returns: Json;
      };
      admin_professional_save: {
        Args: { p_data: Json; p_id: string | null };
        Returns: string;
      };
      admin_professional_set_status: {
        Args: {
          p_id: string;
          p_note?: string;
          p_status: string;
          p_verified: boolean;
        };
        Returns: undefined;
      };
      admin_professional_service_save: {
        Args: { p_data: Json; p_id: string | null; p_professional: string };
        Returns: string;
      };
      admin_professional_suggestion_set: {
        Args: {
          p_on: boolean;
          p_professional: string;
          p_target: string;
          p_target_id: string;
        };
        Returns: undefined;
      };
      admin_brand_save: {
        Args: { p_data: Json; p_id?: string | null };
        Returns: string;
      };
      admin_brand_delete: { Args: { p_id: string }; Returns: undefined };
      admin_brand_product_save: {
        Args: { p_data: Json; p_id?: string | null };
        Returns: string;
      };
      admin_brand_product_delete: {
        Args: { p_id: string };
        Returns: undefined;
      };
      admin_creator_brands_save: {
        Args: { p_creator: string; p_items: Json };
        Returns: number;
      };
      admin_program_brand_products_save: {
        Args: { p_items: Json; p_program: string };
        Returns: number;
      };
      admin_content_brand_links_save: {
        Args: { p_brands: Json; p_content: string; p_products: Json };
        Returns: number;
      };
      admin_content_smart_tags_save: {
        Args: { p_content: string; p_tags: Json };
        Returns: number;
      };
      admin_brand_clicks: { Args: { p_days?: number }; Returns: Json };
      brand_click_bump: {
        Args: { p_kind: string; p_source: string; p_target: string };
        Returns: boolean;
      };
      admin_program_products_save: {
        Args: { p_items: Json; p_program: string };
        Returns: number;
      };
      admin_program_professional_service_set: {
        Args: {
          p_professional: string;
          p_program: string;
          p_service: string | null;
        };
        Returns: undefined;
      };
      admin_invite_professional: {
        Args: { p_days?: number; p_email: string; p_professional: string };
        Returns: {
          invitation_id: string;
          token: string;
        }[];
      };
      professional_tap_bump: {
        Args: {
          p_action: string;
          p_creator: string | null;
          p_professional: string;
          p_source: string;
        };
        Returns: undefined;
      };
      place_bid: {
        Args: { auction_id: string; increment_cents: number };
        Returns: Json;
      };
      post_photo_orphan_uploads: {
        Args: { p_limit: number };
        Returns: string[];
      };
      post_photo_path: { Args: { p_url: string }; Returns: string };
      post_photo_upload_claim: {
        Args: { p_bytes: number; p_mime: string };
        Returns: string;
      };
      post_photo_usable: {
        Args: { p_path: string; p_uid: string };
        Returns: boolean;
      };
      product_is_purchasable: { Args: { p_product: string }; Returns: boolean };
      program_concept_valid: { Args: { c: Json }; Returns: boolean };
      program_required_items: {
        Args: { p_version: string };
        Returns: {
          content_id: string;
          is_required: boolean;
          item_position: number;
          original_content_id: string;
          section: string;
          substituted: boolean;
        }[];
      };
      public_settings: { Args: Record<PropertyKey, never>; Returns: Json };
      push_claim: {
        Args: { p_limit?: number };
        Returns: {
          attempts: number;
          claimed_at: string | null;
          created_at: string;
          dedupe_key: string;
          id: number;
          kind: string;
          last_error: string | null;
          not_before: string;
          outcome: string | null;
          payload: Json;
          sent_at: string | null;
          user_id: string;
        }[];
      };
      push_enqueue_streak_reminders: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      push_outbox_cleanup: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      quote_shipping: {
        Args: { p_seller_count: number; p_subtotal: number; p_zone: string };
        Returns: number;
      };
      recipe_assert_publishable: {
        Args: { p_content: string };
        Returns: undefined;
      };
      recipe_backfill_dry_run: {
        Args: Record<PropertyKey, never>;
        Returns: {
          content_id: string;
          kind: string;
          original: string;
          outcome: string;
          pos: number;
          seed_key: string;
          slug: string;
        }[];
      };
      recipe_action_bump: {
        Args: {
          p_action: string;
          p_content: string;
          p_creator: string;
          p_source: string;
        };
        Returns: boolean;
      };
      recipe_backfill_legacy: { Args: { p_content: string }; Returns: string };
      recipe_catalog: {
        Args: {
          p_categories?: string[];
          p_creator?: string;
          p_cursor?: string;
          p_diets?: string[];
          p_difficulty?: string;
          p_exclude_allergens?: string[];
          p_limit?: number;
          p_max_minutes?: number;
          p_query?: string;
          p_sort?: string;
        };
        Returns: {
          content_id: string;
          cursor: string;
          rank: number;
        }[];
      };
      recipe_delete_media: { Args: { p_media: string }; Returns: Json };
      recipe_legacy_allergen_code: {
        Args: { p_label: string };
        Returns: string;
      };
      recipe_legacy_category_literals: {
        Args: Record<PropertyKey, never>;
        Returns: {
          category_code: string;
          seed_key: string;
        }[];
      };
      recipe_legacy_ingredient_literals: {
        Args: Record<PropertyKey, never>;
        Returns: {
          item: string;
          note: string;
          pos: number;
          qty: string;
          quantity: number;
          quantity_text: string;
          seed_key: string;
          to_taste: boolean;
          unit: string;
        }[];
      };
      recipe_legacy_seed_key: { Args: { p_content: string }; Returns: string };
      recipe_legacy_step_literals: {
        Args: Record<PropertyKey, never>;
        Returns: {
          duration_seconds: number;
          instruction: string;
          pos: number;
          seed_key: string;
          temperature_c: number;
        }[];
      };
      recipe_media_path_ok: { Args: { p_name: string }; Returns: boolean };
      recipe_media_quota_ok: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      recipe_media_registered: { Args: { p_name: string }; Returns: boolean };
      recipe_orphan_media: { Args: { p_limit: number }; Returns: string[] };
      recipe_payload_bool: {
        Args: {
          p_default: boolean;
          p_key: string;
          p_obj: Json;
          p_path: string;
        };
        Returns: boolean;
      };
      recipe_payload_list: {
        Args: {
          p_allowed: string[];
          p_key: string;
          p_max_items: number;
          p_max_len: number;
          p_obj: Json;
          p_path: string;
        };
        Returns: string[];
      };
      recipe_payload_num: {
        Args: {
          p_integer?: boolean;
          p_key: string;
          p_max: number;
          p_min: number;
          p_obj: Json;
          p_path: string;
          p_required?: boolean;
        };
        Returns: number;
      };
      recipe_payload_text: {
        Args: {
          p_key: string;
          p_max: number;
          p_obj: Json;
          p_path: string;
          p_required?: boolean;
        };
        Returns: string;
      };
      recipe_payload_uuid: {
        Args: {
          p_key: string;
          p_obj: Json;
          p_path: string;
          p_required?: boolean;
        };
        Returns: string;
      };
      recipe_publishable_missing: {
        Args: {
          p_content: string;
          p_cover_url: string;
          p_creator: string;
          p_license: string;
          p_summary: string;
          p_title: string;
        };
        Returns: string[];
      };
      recipe_rating_allowed: { Args: { p_content: string }; Returns: boolean };
      recipe_register_media: {
        Args: {
          p_alt: string;
          p_content: string;
          p_height: number;
          p_path: string;
          p_rights: boolean;
          p_role: string;
          p_width: number;
        };
        Returns: string;
      };
      recipe_save: {
        Args: {
          p_content: string;
          p_expected_updated_at: string;
          p_payload: Json;
        };
        Returns: Json;
      };
      recipe_setting_on: { Args: { p_key: string }; Returns: boolean };
      recipe_snapshot: {
        Args: { p_content: string; p_reason: string };
        Returns: string;
      };
      recompute_order_status: { Args: { p_order: string }; Returns: undefined };
      register_push_token: {
        Args: { p_app_version?: string; p_platform: string; p_token: string };
        Returns: undefined;
      };
      routine_check: {
        Args: { p_done?: boolean; p_item: string; p_timezone: string };
        Returns: Json;
      };
      run_retention: { Args: Record<PropertyKey, never>; Returns: Json };
      search_content: {
        Args: {
          p_access?: Database["public"]["Enums"]["access_level"];
          p_creator?: string;
          p_difficulty?: string;
          p_limit?: number;
          p_offset?: number;
          p_pillar?: Database["public"]["Enums"]["pillar"];
          p_query: string;
          p_type?: Database["public"]["Enums"]["content_type"];
        };
        Returns: {
          access_level: Database["public"]["Enums"]["access_level"] | null;
          archived_at: string | null;
          archived_by: string | null;
          completion_mode:
            | Database["public"]["Enums"]["completion_mode"]
            | null;
          cover_url: string | null;
          created_at: string;
          created_by: string | null;
          creator_id: string | null;
          creator_link_origin: string | null;
          difficulty: string | null;
          disclaimer_kind: string | null;
          duration_minutes: number | null;
          featured_rank: number | null;
          has_captions: boolean;
          id: string;
          is_featured: boolean;
          media_credit: string | null;
          media_license_kind: string;
          media_license_ref: string | null;
          pillar: Database["public"]["Enums"]["pillar"];
          publish_at: string | null;
          published_at: string | null;
          required_module_id: string | null;
          review_status: Database["public"]["Enums"]["review_status"];
          search: unknown;
          slug: string;
          source_locale: Database["public"]["Enums"]["locale_code"];
          status: Database["public"]["Enums"]["content_status"];
          summary: string | null;
          tags: string[];
          title: string;
          type: Database["public"]["Enums"]["content_type"];
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "content";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      seed_uuid: { Args: { p: string }; Returns: string };
      select_modules: { Args: { p_module_ids: string[] }; Returns: Json };
      setting: { Args: { p_key: string }; Returns: Json };
      shortcut_open_bump: {
        Args: { p_creator: string; p_source: string };
        Returns: boolean;
      };
      hero_page_view_bump: { Args: { p_creator: string }; Returns: boolean };
      slugify: { Args: { p: string }; Returns: string };
      stream_cleanup_candidates: {
        Args: { p_cutoff: string; p_limit: number };
        Returns: {
          draft_id: string;
          referenced: boolean;
          uid: string;
        }[];
      };
      stream_cleanup_discard: {
        Args: { p_draft: string; p_uid: string };
        Returns: boolean;
      };
      submit_content_for_review:
        | { Args: { p_content: string }; Returns: undefined }
        | {
            Args: { p_content: string; p_requested_publish_at: string };
            Returns: undefined;
          };
      submit_feedback:
        | {
            Args: {
              p_context: string;
              p_locale?: Database["public"]["Enums"]["locale_code"];
              p_message: string;
              p_rating: number;
            };
            Returns: string;
          }
        | {
            Args: {
              p_category: string;
              p_context: string;
              p_locale: Database["public"]["Enums"]["locale_code"];
              p_message: string;
              p_rating: number;
            };
            Returns: string;
          };
      sync_all_subscriptions: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      sync_subscription: { Args: { p_user: string }; Returns: undefined };
      track_event: {
        Args: {
          p_anon_id?: string;
          p_event: string;
          p_locale?: Database["public"]["Enums"]["locale_code"];
          p_properties?: Json;
        };
        Returns: undefined;
      };
      track_progress: {
        Args: {
          p_content: string;
          p_position_seconds: number;
          p_progress_pct: number;
          p_timezone: string;
        };
        Returns: Json;
      };
      user_entitled_modules: { Args: { p_user: string }; Returns: string[] };
      verify_certificate: { Args: { p_code: string }; Returns: Json };
      wearable_disconnect: { Args: { p_connection: string }; Returns: Json };
    };
    Enums: {
      access_level: "free" | "premium";
      actor_type:
        | "consumer"
        | "creator"
        | "seller"
        | "admin"
        | "system"
        | "agency"
        | "brand";
      app_role:
        | "consumer"
        | "creator"
        | "seller"
        | "admin"
        | "professional"
        | "agency"
        | "brand";
      availability: "available" | "unavailable";
      completion_mode: "manual" | "auto";
      content_status: "draft" | "published" | "archived";
      content_type: "video" | "recipe" | "workout" | "guide" | "article";
      enrollment_status: "active" | "completed" | "abandoned";
      fulfillment_status:
        | "awaiting"
        | "preparing"
        | "ready_for_dispatch"
        | "in_transit"
        | "delivered"
        | "cancelled"
        | "failed";
      invitation_status: "pending" | "accepted" | "expired" | "revoked";
      link_status: "suggested" | "validated" | "suspended" | "rejected";
      locale_code: "pt-BR" | "en" | "es";
      media_provider:
        | "none"
        | "embed_youtube"
        | "embed_vimeo"
        | "cloudflare_stream"
        | "mux"
        | "upload";
      moderation_status: "clear" | "hidden" | "suspended";
      order_status:
        | "confirmed"
        | "in_progress"
        | "completed"
        | "partially_completed"
        | "cancelled"
        | "failed";
      partner_status: "pending" | "active" | "suspended";
      pillar: "routine" | "training" | "nutrition" | "gastronomy";
      product_status: "draft" | "published" | "archived";
      review_status:
        | "none"
        | "in_review"
        | "returned"
        | "approved"
        | "rejected";
      subscription_status: "active" | "cancelled" | "expired";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      access_level: ["free", "premium"],
      actor_type: [
        "consumer",
        "creator",
        "seller",
        "admin",
        "system",
        "agency",
        "brand",
      ],
      app_role: [
        "consumer",
        "creator",
        "seller",
        "admin",
        "professional",
        "agency",
        "brand",
      ],
      availability: ["available", "unavailable"],
      completion_mode: ["manual", "auto"],
      content_status: ["draft", "published", "archived"],
      content_type: ["video", "recipe", "workout", "guide", "article"],
      enrollment_status: ["active", "completed", "abandoned"],
      fulfillment_status: [
        "awaiting",
        "preparing",
        "ready_for_dispatch",
        "in_transit",
        "delivered",
        "cancelled",
        "failed",
      ],
      invitation_status: ["pending", "accepted", "expired", "revoked"],
      link_status: ["suggested", "validated", "suspended", "rejected"],
      locale_code: ["pt-BR", "en", "es"],
      media_provider: [
        "none",
        "embed_youtube",
        "embed_vimeo",
        "cloudflare_stream",
        "mux",
        "upload",
      ],
      moderation_status: ["clear", "hidden", "suspended"],
      order_status: [
        "confirmed",
        "in_progress",
        "completed",
        "partially_completed",
        "cancelled",
        "failed",
      ],
      partner_status: ["pending", "active", "suspended"],
      pillar: ["routine", "training", "nutrition", "gastronomy"],
      product_status: ["draft", "published", "archived"],
      review_status: ["none", "in_review", "returned", "approved", "rejected"],
      subscription_status: ["active", "cancelled", "expired"],
    },
  },
} as const;
