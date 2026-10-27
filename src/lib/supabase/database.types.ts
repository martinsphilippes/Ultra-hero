
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "account_deletion_requests": {
                  Row: {
                    "id": string,"processed_at": string | null,"requested_at": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"processed_at"?: string | null,"requested_at"?: string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "id"?: string,"processed_at"?: string | null,"requested_at"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"achievements": {
                  Row: {
                    "code": string,"description": string | null,"icon": string | null,"id": string,"is_active": boolean,"name": string,"rule": NonNullable<Json>,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"description"?: string | null,"icon"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"rule"?: NonNullable<Json>,"sort_order"?: number
                  }
                  Update: {
                    "code"?: string,"description"?: string | null,"icon"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"rule"?: NonNullable<Json>,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"admin_audit": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_type": Database["public"]['Enums']["actor_type"],"after_data": Json | null,"before_data": Json | null,"created_at": string,"id": number,"justification": string | null,"resource_id": string | null,"resource_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_type"?: Database["public"]['Enums']["actor_type"],"after_data"?: Json | null,"before_data"?: Json | null,"created_at"?: string,"id"?: never,"justification"?: string | null,"resource_id"?: string | null,"resource_type": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_type"?: Database["public"]['Enums']["actor_type"],"after_data"?: Json | null,"before_data"?: Json | null,"created_at"?: string,"id"?: never,"justification"?: string | null,"resource_id"?: string | null,"resource_type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"analytics_events": {
                  Row: {
                    "anon_id": string | null,"created_at": string,"event_name": string,"expires_at": string,"id": number,"locale": Database["public"]['Enums']["locale_code"] | null,"properties": NonNullable<Json>,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "anon_id"?: string | null,"created_at"?: string,"event_name": string,"expires_at"?: string,"id"?: never,"locale"?: Database["public"]['Enums']["locale_code"] | null,"properties"?: NonNullable<Json>,"user_id"?: string | null
                  }
                  Update: {
                    "anon_id"?: string | null,"created_at"?: string,"event_name"?: string,"expires_at"?: string,"id"?: never,"locale"?: Database["public"]['Enums']["locale_code"] | null,"properties"?: NonNullable<Json>,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"app_settings": {
                  Row: {
                    "description": string | null,"key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "description"?: string | null,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"avatar_uploads": {
                  Row: {
                    "bytes": number,"created_at": string,"deleted_at": string | null,"id": string,"mime": string,"path": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bytes": number,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"mime": string,"path": string,"user_id"?: string | null
                  }
                  Update: {
                    "bytes"?: number,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"mime"?: string,"path"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"cart_items": {
                  Row: {
                    "added_at": string,"cart_id": string,"product_id": string,"quantity": number
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"cart_id": string,"product_id": string,"quantity": number
                  }
                  Update: {
                    "added_at"?: string,"cart_id"?: string,"product_id"?: string,"quantity"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "cart_items_cart_id_fkey"
      columns: ["cart_id"]
isOneToOne: false
      referencedRelation: "carts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cart_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"carts": {
                  Row: {
                    "id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"certificates": {
                  Row: {
                    "code": string,"enrollment_id": string,"id": string,"issued_at": string,"program_id": string,"revoked_at": string | null,"snapshot": NonNullable<Json>,"user_id": string,"version_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"enrollment_id": string,"id"?: string,"issued_at"?: string,"program_id": string,"revoked_at"?: string | null,"snapshot": NonNullable<Json>,"user_id": string,"version_id": string
                  }
                  Update: {
                    "code"?: string,"enrollment_id"?: string,"id"?: string,"issued_at"?: string,"program_id"?: string,"revoked_at"?: string | null,"snapshot"?: NonNullable<Json>,"user_id"?: string,"version_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "certificates_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: true
      referencedRelation: "enrollments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "certificates_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "certificates_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "program_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"completions": {
                  Row: {
                    "completed_at": string,"content_id": string,"id": string,"local_date": string,"source": string,"timezone": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string,"content_id": string,"id"?: string,"local_date": string,"source"?: string,"timezone": string,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string,"content_id"?: string,"id"?: string,"local_date"?: string,"source"?: string,"timezone"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "completions_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                },"content": {
                  Row: {
                    "access_level": Database["public"]['Enums']["access_level"] | null,"archived_at": string | null,"archived_by": string | null,"completion_mode": Database["public"]['Enums']["completion_mode"] | null,"cover_url": string | null,"created_at": string,"created_by": string | null,"creator_id": string | null,"creator_link_origin": string | null,"difficulty": string | null,"disclaimer_kind": string | null,"duration_minutes": number | null,"featured_rank": number | null,"has_captions": boolean,"id": string,"is_featured": boolean,"media_credit": string | null,"media_license_kind": string,"media_license_ref": string | null,"pillar": Database["public"]['Enums']["pillar"],"publish_at": string | null,"published_at": string | null,"required_module_id": string | null,"review_status": Database["public"]['Enums']["review_status"],"search": unknown,"slug": string,"source_locale": Database["public"]['Enums']["locale_code"],"status": Database["public"]['Enums']["content_status"],"summary": string | null,"tags": (string)[],"title": string,"type": Database["public"]['Enums']["content_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_level"?: Database["public"]['Enums']["access_level"] | null,"archived_at"?: string | null,"archived_by"?: string | null,"completion_mode"?: Database["public"]['Enums']["completion_mode"] | null,"cover_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"creator_id"?: string | null,"creator_link_origin"?: string | null,"difficulty"?: string | null,"disclaimer_kind"?: string | null,"duration_minutes"?: number | null,"featured_rank"?: number | null,"has_captions"?: boolean,"id"?: string,"is_featured"?: boolean,"media_credit"?: string | null,"media_license_kind"?: string,"media_license_ref"?: string | null,"pillar": Database["public"]['Enums']["pillar"],"publish_at"?: string | null,"published_at"?: string | null,"required_module_id"?: string | null,"review_status"?: Database["public"]['Enums']["review_status"],"search"?: never,"slug": string,"source_locale"?: Database["public"]['Enums']["locale_code"],"status"?: Database["public"]['Enums']["content_status"],"summary"?: string | null,"tags"?: (string)[],"title": string,"type": Database["public"]['Enums']["content_type"],"updated_at"?: string
                  }
                  Update: {
                    "access_level"?: Database["public"]['Enums']["access_level"] | null,"archived_at"?: string | null,"archived_by"?: string | null,"completion_mode"?: Database["public"]['Enums']["completion_mode"] | null,"cover_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"creator_id"?: string | null,"creator_link_origin"?: string | null,"difficulty"?: string | null,"disclaimer_kind"?: string | null,"duration_minutes"?: number | null,"featured_rank"?: number | null,"has_captions"?: boolean,"id"?: string,"is_featured"?: boolean,"media_credit"?: string | null,"media_license_kind"?: string,"media_license_ref"?: string | null,"pillar"?: Database["public"]['Enums']["pillar"],"publish_at"?: string | null,"published_at"?: string | null,"required_module_id"?: string | null,"review_status"?: Database["public"]['Enums']["review_status"],"search"?: never,"slug"?: string,"source_locale"?: Database["public"]['Enums']["locale_code"],"status"?: Database["public"]['Enums']["content_status"],"summary"?: string | null,"tags"?: (string)[],"title"?: string,"type"?: Database["public"]['Enums']["content_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_creator_id_fkey"
      columns: ["creator_id"]
isOneToOne: false
      referencedRelation: "creator_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_required_module_id_fkey"
      columns: ["required_module_id"]
isOneToOne: false
      referencedRelation: "plan_modules"
      referencedColumns: ["id"]
    }
                  ]
                },"content_bodies": {
                  Row: {
                    "body": NonNullable<Json>,"captions_url": string | null,"content_id": string,"media_provider": Database["public"]['Enums']["media_provider"],"media_ref": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: NonNullable<Json>,"captions_url"?: string | null,"content_id": string,"media_provider"?: Database["public"]['Enums']["media_provider"],"media_ref"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "body"?: NonNullable<Json>,"captions_url"?: string | null,"content_id"?: string,"media_provider"?: Database["public"]['Enums']["media_provider"],"media_ref"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_bodies_content_id_fkey"
      columns: ["content_id"]
isOneToOne: true
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                },"content_localizations": {
                  Row: {
                    "body": Json | null,"content_id": string,"locale": Database["public"]['Enums']["locale_code"],"status": string,"summary": string | null,"title": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: Json | null,"content_id": string,"locale": Database["public"]['Enums']["locale_code"],"status"?: string,"summary"?: string | null,"title": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "body"?: Json | null,"content_id"?: string,"locale"?: Database["public"]['Enums']["locale_code"],"status"?: string,"summary"?: string | null,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_localizations_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                },"content_product_links": {
                  Row: {
                    "admin_note": string | null,"content_id": string,"created_at": string,"id": string,"note": string | null,"product_id": string,"product_version_at_validation": number | null,"status": Database["public"]['Enums']["link_status"],"suggested_by": string | null,"suggested_by_creator": string | null,"suspended_reason": string | null,"updated_at": string,"validated_at": string | null,"validated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_note"?: string | null,"content_id": string,"created_at"?: string,"id"?: string,"note"?: string | null,"product_id": string,"product_version_at_validation"?: number | null,"status"?: Database["public"]['Enums']["link_status"],"suggested_by"?: string | null,"suggested_by_creator"?: string | null,"suspended_reason"?: string | null,"updated_at"?: string,"validated_at"?: string | null,"validated_by"?: string | null
                  }
                  Update: {
                    "admin_note"?: string | null,"content_id"?: string,"created_at"?: string,"id"?: string,"note"?: string | null,"product_id"?: string,"product_version_at_validation"?: number | null,"status"?: Database["public"]['Enums']["link_status"],"suggested_by"?: string | null,"suggested_by_creator"?: string | null,"suspended_reason"?: string | null,"updated_at"?: string,"validated_at"?: string | null,"validated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_product_links_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_product_links_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_product_links_suggested_by_creator_fkey"
      columns: ["suggested_by_creator"]
isOneToOne: false
      referencedRelation: "creator_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"content_progress": {
                  Row: {
                    "content_id": string,"position_seconds": number,"progress_pct": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id": string,"position_seconds"?: number,"progress_pct"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "content_id"?: string,"position_seconds"?: number,"progress_pct"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_progress_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                },"content_reviews": {
                  Row: {
                    "content_id": string,"decided_at": string | null,"decided_by": string | null,"decision": Database["public"]['Enums']["review_status"],"feedback": string | null,"id": string,"requested_publish_at": string | null,"round": number,"submitted_at": string,"submitted_by": string | null,"version_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id": string,"decided_at"?: string | null,"decided_by"?: string | null,"decision"?: Database["public"]['Enums']["review_status"],"feedback"?: string | null,"id"?: string,"requested_publish_at"?: string | null,"round"?: number,"submitted_at"?: string,"submitted_by"?: string | null,"version_id"?: string | null
                  }
                  Update: {
                    "content_id"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision"?: Database["public"]['Enums']["review_status"],"feedback"?: string | null,"id"?: string,"requested_publish_at"?: string | null,"round"?: number,"submitted_at"?: string,"submitted_by"?: string | null,"version_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_reviews_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_reviews_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "recipe_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"content_type_settings": {
                  Row: {
                    "auto_threshold_pct": number,"default_completion_mode": Database["public"]['Enums']["completion_mode"],"review_required": boolean,"type": Database["public"]['Enums']["content_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_threshold_pct"?: number,"default_completion_mode"?: Database["public"]['Enums']["completion_mode"],"review_required"?: boolean,"type": Database["public"]['Enums']["content_type"]
                  }
                  Update: {
                    "auto_threshold_pct"?: number,"default_completion_mode"?: Database["public"]['Enums']["completion_mode"],"review_required"?: boolean,"type"?: Database["public"]['Enums']["content_type"]
                  }
                  Relationships: [
                    
                  ]
                },"creator_credentials_requests": {
                  Row: {
                    "creator_id": string,"decided_at": string | null,"decision": string | null,"text": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "creator_id": string,"decided_at"?: string | null,"decision"?: string | null,"text": string,"updated_at"?: string
                  }
                  Update: {
                    "creator_id"?: string,"decided_at"?: string | null,"decision"?: string | null,"text"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "creator_credentials_requests_creator_id_fkey"
      columns: ["creator_id"]
isOneToOne: true
      referencedRelation: "creator_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"creator_products": {
                  Row: {
                    "created_at": string,"created_by": string | null,"creator_id": string,"id": string,"note": string | null,"product_id": string,"sort_order": number,"status": Database["public"]['Enums']["link_status"],"updated_at": string,"validated_at": string | null,"validated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"creator_id": string,"id"?: string,"note"?: string | null,"product_id": string,"sort_order"?: number,"status"?: Database["public"]['Enums']["link_status"],"updated_at"?: string,"validated_at"?: string | null,"validated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"creator_id"?: string,"id"?: string,"note"?: string | null,"product_id"?: string,"sort_order"?: number,"status"?: Database["public"]['Enums']["link_status"],"updated_at"?: string,"validated_at"?: string | null,"validated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "creator_products_creator_id_fkey"
      columns: ["creator_id"]
isOneToOne: false
      referencedRelation: "creator_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creator_products_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"creator_profiles": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"cover_url": string | null,"created_at": string,"credentials": string | null,"credentials_approved_at": string | null,"headline": string | null,"id": string,"is_fictional": boolean,"name": string,"pillars": (Database["public"]['Enums']["pillar"])[],"rights_holder": string | null,"rights_note": string | null,"rights_status": string,"rights_valid_until": string | null,"slug": string,"socials": NonNullable<Json>,"sort_order": number,"specialties": (string)[],"status": Database["public"]['Enums']["partner_status"],"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"bio"?: string | null,"cover_url"?: string | null,"created_at"?: string,"credentials"?: string | null,"credentials_approved_at"?: string | null,"headline"?: string | null,"id"?: string,"is_fictional"?: boolean,"name": string,"pillars"?: (Database["public"]['Enums']["pillar"])[],"rights_holder"?: string | null,"rights_note"?: string | null,"rights_status"?: string,"rights_valid_until"?: string | null,"slug": string,"socials"?: NonNullable<Json>,"sort_order"?: number,"specialties"?: (string)[],"status"?: Database["public"]['Enums']["partner_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"bio"?: string | null,"cover_url"?: string | null,"created_at"?: string,"credentials"?: string | null,"credentials_approved_at"?: string | null,"headline"?: string | null,"id"?: string,"is_fictional"?: boolean,"name"?: string,"pillars"?: (Database["public"]['Enums']["pillar"])[],"rights_holder"?: string | null,"rights_note"?: string | null,"rights_status"?: string,"rights_valid_until"?: string | null,"slug"?: string,"socials"?: NonNullable<Json>,"sort_order"?: number,"specialties"?: (string)[],"status"?: Database["public"]['Enums']["partner_status"],"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"creator_recipe_links": {
                  Row: {
                    "content_id": string,"created_at": string,"created_by": string | null,"creator_id": string,"id": string,"sort_order": number,"status": Database["public"]['Enums']["link_status"],"updated_at": string,"validated_at": string | null,"validated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id": string,"created_at"?: string,"created_by"?: string | null,"creator_id": string,"id"?: string,"sort_order"?: number,"status"?: Database["public"]['Enums']["link_status"],"updated_at"?: string,"validated_at"?: string | null,"validated_by"?: string | null
                  }
                  Update: {
                    "content_id"?: string,"created_at"?: string,"created_by"?: string | null,"creator_id"?: string,"id"?: string,"sort_order"?: number,"status"?: Database["public"]['Enums']["link_status"],"updated_at"?: string,"validated_at"?: string | null,"validated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "creator_recipe_links_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "creator_recipe_links_creator_id_fkey"
      columns: ["creator_id"]
isOneToOne: false
      referencedRelation: "creator_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"creator_rights_private": {
                  Row: {
                    "creator_id": string,"document_ref": string | null,"notes": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "creator_id": string,"document_ref"?: string | null,"notes"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "creator_id"?: string,"document_ref"?: string | null,"notes"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "creator_rights_private_creator_id_fkey"
      columns: ["creator_id"]
isOneToOne: true
      referencedRelation: "creator_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"custom_lists": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"demo_destinations": {
                  Row: {
                    "code": string,"description": Json | null,"id": string,"is_active": boolean,"name": NonNullable<Json>,"sort_order": number,"zone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"description"?: Json | null,"id"?: string,"is_active"?: boolean,"name": NonNullable<Json>,"sort_order"?: number,"zone": string
                  }
                  Update: {
                    "code"?: string,"description"?: Json | null,"id"?: string,"is_active"?: boolean,"name"?: NonNullable<Json>,"sort_order"?: number,"zone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"demo_shipping_rules": {
                  Row: {
                    "base_cents": number,"eta_days_max": number,"eta_days_min": number,"free_over_cents": number | null,"per_seller_cents": number,"zone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_cents": number,"eta_days_max"?: number,"eta_days_min"?: number,"free_over_cents"?: number | null,"per_seller_cents"?: number,"zone": string
                  }
                  Update: {
                    "base_cents"?: number,"eta_days_max"?: number,"eta_days_min"?: number,"free_over_cents"?: number | null,"per_seller_cents"?: number,"zone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"enrollments": {
                  Row: {
                    "completed_at": string | null,"enrolled_at": string,"id": string,"program_id": string,"status": Database["public"]['Enums']["enrollment_status"],"user_id": string,"version_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"enrolled_at"?: string,"id"?: string,"program_id": string,"status"?: Database["public"]['Enums']["enrollment_status"],"user_id": string,"version_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"enrolled_at"?: string,"id"?: string,"program_id"?: string,"status"?: Database["public"]['Enums']["enrollment_status"],"user_id"?: string,"version_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrollments_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enrollments_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "program_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"favorites": {
                  Row: {
                    "content_id": string | null,"created_at": string,"id": string,"item_type": string | null,"product_id": string | null,"program_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id"?: string | null,"created_at"?: string,"id"?: string,"item_type"?: never,"product_id"?: string | null,"program_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "content_id"?: string | null,"created_at"?: string,"id"?: string,"item_type"?: never,"product_id"?: string | null,"program_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "favorites_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favorites_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "favorites_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"feedback": {
                  Row: {
                    "admin_note": string | null,"assignee": string | null,"category": string,"context": string,"created_at": string,"id": string,"locale": Database["public"]['Enums']["locale_code"] | null,"message": string | null,"priority": string | null,"rating": number | null,"status": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_note"?: string | null,"assignee"?: string | null,"category"?: string,"context": string,"created_at"?: string,"id"?: string,"locale"?: Database["public"]['Enums']["locale_code"] | null,"message"?: string | null,"priority"?: string | null,"rating"?: number | null,"status"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "admin_note"?: string | null,"assignee"?: string | null,"category"?: string,"context"?: string,"created_at"?: string,"id"?: string,"locale"?: Database["public"]['Enums']["locale_code"] | null,"message"?: string | null,"priority"?: string | null,"rating"?: number | null,"status"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"fulfillment_events": {
                  Row: {
                    "actor_id": string | null,"actor_type": Database["public"]['Enums']["actor_type"],"created_at": string,"from_status": Database["public"]['Enums']["fulfillment_status"] | null,"fulfillment_id": string,"id": number,"note": string | null,"to_status": Database["public"]['Enums']["fulfillment_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"actor_type": Database["public"]['Enums']["actor_type"],"created_at"?: string,"from_status"?: Database["public"]['Enums']["fulfillment_status"] | null,"fulfillment_id": string,"id"?: never,"note"?: string | null,"to_status": Database["public"]['Enums']["fulfillment_status"]
                  }
                  Update: {
                    "actor_id"?: string | null,"actor_type"?: Database["public"]['Enums']["actor_type"],"created_at"?: string,"from_status"?: Database["public"]['Enums']["fulfillment_status"] | null,"fulfillment_id"?: string,"id"?: never,"note"?: string | null,"to_status"?: Database["public"]['Enums']["fulfillment_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "fulfillment_events_fulfillment_id_fkey"
      columns: ["fulfillment_id"]
isOneToOne: false
      referencedRelation: "test_fulfillments"
      referencedColumns: ["id"]
    }
                  ]
                },"interest_tags": {
                  Row: {
                    "label": NonNullable<Json>,"pillar": Database["public"]['Enums']["pillar"] | null,"sort_order": number,"tag": string
                  }
                  ComputedFields: never
                  Insert: {
                    "label": NonNullable<Json>,"pillar"?: Database["public"]['Enums']["pillar"] | null,"sort_order"?: number,"tag": string
                  }
                  Update: {
                    "label"?: NonNullable<Json>,"pillar"?: Database["public"]['Enums']["pillar"] | null,"sort_order"?: number,"tag"?: string
                  }
                  Relationships: [
                    
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"created_by": string | null,"creator_profile_id": string | null,"email": string,"expires_at": string,"id": string,"revoked_at": string | null,"role": Database["public"]['Enums']["app_role"],"seller_org_id": string | null,"status": Database["public"]['Enums']["invitation_status"],"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"creator_profile_id"?: string | null,"email": string,"expires_at": string,"id"?: string,"revoked_at"?: string | null,"role": Database["public"]['Enums']["app_role"],"seller_org_id"?: string | null,"status"?: Database["public"]['Enums']["invitation_status"],"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"creator_profile_id"?: string | null,"email"?: string,"expires_at"?: string,"id"?: string,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"seller_org_id"?: string | null,"status"?: Database["public"]['Enums']["invitation_status"],"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_creator_profile_id_fkey"
      columns: ["creator_profile_id"]
isOneToOne: false
      referencedRelation: "creator_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_seller_org_id_fkey"
      columns: ["seller_org_id"]
isOneToOne: false
      referencedRelation: "seller_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"list_items": {
                  Row: {
                    "added_at": string,"content_id": string | null,"id": string,"item_type": string | null,"list_id": string,"position": number,"product_id": string | null,"program_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "added_at"?: string,"content_id"?: string | null,"id"?: string,"item_type"?: never,"list_id": string,"position"?: number,"product_id"?: string | null,"program_id"?: string | null
                  }
                  Update: {
                    "added_at"?: string,"content_id"?: string | null,"id"?: string,"item_type"?: never,"list_id"?: string,"position"?: number,"product_id"?: string | null,"program_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "list_items_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "list_items_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "custom_lists"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "list_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "list_items_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"module_dependencies": {
                  Row: {
                    "module_id": string,"requires_module_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "module_id": string,"requires_module_id": string
                  }
                  Update: {
                    "module_id"?: string,"requires_module_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "module_dependencies_module_id_fkey"
      columns: ["module_id"]
isOneToOne: false
      referencedRelation: "plan_modules"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "module_dependencies_requires_module_id_fkey"
      columns: ["requires_module_id"]
isOneToOne: false
      referencedRelation: "plan_modules"
      referencedColumns: ["id"]
    }
                  ]
                },"not_interested": {
                  Row: {
                    "content_id": string,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "content_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "not_interested_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "channel_email": boolean,"channel_push": boolean,"commerce_updates": boolean,"editorial_digest": boolean,"streak_reminders": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel_email"?: boolean,"channel_push"?: boolean,"commerce_updates"?: boolean,"editorial_digest"?: boolean,"streak_reminders"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "channel_email"?: boolean,"channel_push"?: boolean,"commerce_updates"?: boolean,"editorial_digest"?: boolean,"streak_reminders"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"plan_bundle_modules": {
                  Row: {
                    "module_id": string,"plan_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "module_id": string,"plan_id": string
                  }
                  Update: {
                    "module_id"?: string,"plan_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_bundle_modules_module_id_fkey"
      columns: ["module_id"]
isOneToOne: false
      referencedRelation: "plan_modules"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_bundle_modules_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_modules": {
                  Row: {
                    "code": string,"created_at": string,"description": string | null,"id": string,"is_active": boolean,"name": string,"price_cents_demo": number,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"price_cents_demo"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"price_cents_demo"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"plans": {
                  Row: {
                    "code": string,"created_at": string,"description": string | null,"id": string,"is_active": boolean,"is_free": boolean,"name": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"is_free"?: boolean,"name": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"is_free"?: boolean,"name"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"product_categories": {
                  Row: {
                    "code": string,"id": string,"is_food": boolean,"kind": string,"name": NonNullable<Json>,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"id"?: string,"is_food"?: boolean,"kind": string,"name": NonNullable<Json>,"sort_order"?: number
                  }
                  Update: {
                    "code"?: string,"id"?: string,"is_food"?: boolean,"kind"?: string,"name"?: NonNullable<Json>,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"product_interest": {
                  Row: {
                    "created_at": string,"id": number,"product_id": string,"source": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"product_id": string,"source": string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"product_id"?: string,"source"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_interest_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_moderation": {
                  Row: {
                    "action": string,"admin_id": string | null,"created_at": string,"id": string,"product_id": string,"reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"admin_id"?: string | null,"created_at"?: string,"id"?: string,"product_id": string,"reason"?: string | null
                  }
                  Update: {
                    "action"?: string,"admin_id"?: string | null,"created_at"?: string,"id"?: string,"product_id"?: string,"reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_moderation_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_versions": {
                  Row: {
                    "changed_by": string | null,"changed_fields": (string)[],"created_at": string,"id": string,"product_id": string,"significant": boolean,"snapshot": NonNullable<Json>,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_by"?: string | null,"changed_fields"?: (string)[],"created_at"?: string,"id"?: string,"product_id": string,"significant"?: boolean,"snapshot": NonNullable<Json>,"version": number
                  }
                  Update: {
                    "changed_by"?: string | null,"changed_fields"?: (string)[],"created_at"?: string,"id"?: string,"product_id"?: string,"significant"?: boolean,"snapshot"?: NonNullable<Json>,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_versions_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "archived_at": string | null,"attributes": NonNullable<Json>,"availability": Database["public"]['Enums']["availability"],"category_id": string,"created_at": string,"created_by": string | null,"demo_stock": number | null,"description": string,"food_info": Json | null,"id": string,"image_url": string,"moderation_reason": string | null,"moderation_status": Database["public"]['Enums']["moderation_status"],"price_cents_demo": number,"product_type": string,"published_at": string | null,"search": unknown,"seller_org_id": string,"slug": string,"status": Database["public"]['Enums']["product_status"],"title": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"attributes"?: NonNullable<Json>,"availability"?: Database["public"]['Enums']["availability"],"category_id": string,"created_at"?: string,"created_by"?: string | null,"demo_stock"?: number | null,"description": string,"food_info"?: Json | null,"id"?: string,"image_url": string,"moderation_reason"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"price_cents_demo": number,"product_type": string,"published_at"?: string | null,"search"?: never,"seller_org_id": string,"slug": string,"status"?: Database["public"]['Enums']["product_status"],"title": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "archived_at"?: string | null,"attributes"?: NonNullable<Json>,"availability"?: Database["public"]['Enums']["availability"],"category_id"?: string,"created_at"?: string,"created_by"?: string | null,"demo_stock"?: number | null,"description"?: string,"food_info"?: Json | null,"id"?: string,"image_url"?: string,"moderation_reason"?: string | null,"moderation_status"?: Database["public"]['Enums']["moderation_status"],"price_cents_demo"?: number,"product_type"?: string,"published_at"?: string | null,"search"?: never,"seller_org_id"?: string,"slug"?: string,"status"?: Database["public"]['Enums']["product_status"],"title"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "product_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_seller_org_id_fkey"
      columns: ["seller_org_id"]
isOneToOne: false
      referencedRelation: "seller_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "anonymized_at": string | null,"avatar_url": string | null,"created_at": string,"display_name": string | null,"id": string,"locale": Database["public"]['Enums']["locale_code"] | null,"onboarding_completed": boolean,"theme": string,"timezone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anonymized_at"?: string | null,"avatar_url"?: string | null,"created_at"?: string,"display_name"?: string | null,"id": string,"locale"?: Database["public"]['Enums']["locale_code"] | null,"onboarding_completed"?: boolean,"theme"?: string,"timezone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "anonymized_at"?: string | null,"avatar_url"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"locale"?: Database["public"]['Enums']["locale_code"] | null,"onboarding_completed"?: boolean,"theme"?: string,"timezone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"program_item_substitutions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"original_content_id": string,"reason": string | null,"replacement_content_id": string,"version_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"original_content_id": string,"reason"?: string | null,"replacement_content_id": string,"version_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"original_content_id"?: string,"reason"?: string | null,"replacement_content_id"?: string,"version_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_item_substitutions_original_content_id_fkey"
      columns: ["original_content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_item_substitutions_replacement_content_id_fkey"
      columns: ["replacement_content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_item_substitutions_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "program_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"program_items": {
                  Row: {
                    "content_id": string,"id": string,"is_required": boolean,"position": number,"section": string | null,"version_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id": string,"id"?: string,"is_required"?: boolean,"position"?: number,"section"?: string | null,"version_id": string
                  }
                  Update: {
                    "content_id"?: string,"id"?: string,"is_required"?: boolean,"position"?: number,"section"?: string | null,"version_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_items_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_items_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "program_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"program_localizations": {
                  Row: {
                    "description": string | null,"locale": Database["public"]['Enums']["locale_code"],"status": string,"summary": string | null,"title": string,"updated_at": string,"updated_by": string | null,"version_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"locale": Database["public"]['Enums']["locale_code"],"status"?: string,"summary"?: string | null,"title": string,"updated_at"?: string,"updated_by"?: string | null,"version_id": string
                  }
                  Update: {
                    "description"?: string | null,"locale"?: Database["public"]['Enums']["locale_code"],"status"?: string,"summary"?: string | null,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"version_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_localizations_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "program_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"program_versions": {
                  Row: {
                    "certificate_fields": NonNullable<Json>,"created_at": string,"created_by": string | null,"description": string | null,"estimated_weeks": number | null,"id": string,"program_id": string,"published_at": string | null,"source_locale": Database["public"]['Enums']["locale_code"],"status": Database["public"]['Enums']["content_status"],"summary": string | null,"title": string,"version_no": number
                  }
                  ComputedFields: never
                  Insert: {
                    "certificate_fields"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"estimated_weeks"?: number | null,"id"?: string,"program_id": string,"published_at"?: string | null,"source_locale"?: Database["public"]['Enums']["locale_code"],"status"?: Database["public"]['Enums']["content_status"],"summary"?: string | null,"title": string,"version_no": number
                  }
                  Update: {
                    "certificate_fields"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"estimated_weeks"?: number | null,"id"?: string,"program_id"?: string,"published_at"?: string | null,"source_locale"?: Database["public"]['Enums']["locale_code"],"status"?: Database["public"]['Enums']["content_status"],"summary"?: string | null,"title"?: string,"version_no"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_versions_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"programs": {
                  Row: {
                    "cover_url": string | null,"created_at": string,"created_by": string | null,"creator_id": string | null,"current_version_id": string | null,"featured_rank": number | null,"id": string,"is_featured": boolean,"pillar": Database["public"]['Enums']["pillar"],"slug": string,"status": Database["public"]['Enums']["content_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cover_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"creator_id"?: string | null,"current_version_id"?: string | null,"featured_rank"?: number | null,"id"?: string,"is_featured"?: boolean,"pillar": Database["public"]['Enums']["pillar"],"slug": string,"status"?: Database["public"]['Enums']["content_status"],"updated_at"?: string
                  }
                  Update: {
                    "cover_url"?: string | null,"created_at"?: string,"created_by"?: string | null,"creator_id"?: string | null,"current_version_id"?: string | null,"featured_rank"?: number | null,"id"?: string,"is_featured"?: boolean,"pillar"?: Database["public"]['Enums']["pillar"],"slug"?: string,"status"?: Database["public"]['Enums']["content_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "programs_creator_id_fkey"
      columns: ["creator_id"]
isOneToOne: false
      referencedRelation: "creator_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "programs_current_version_fk"
      columns: ["current_version_id"]
isOneToOne: false
      referencedRelation: "program_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_categories": {
                  Row: {
                    "active": boolean,"code": string,"created_at": string,"name": NonNullable<Json>,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code": string,"created_at"?: string,"name": NonNullable<Json>,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"created_at"?: string,"name"?: NonNullable<Json>,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recipe_category_links": {
                  Row: {
                    "category_code": string,"content_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_code": string,"content_id": string
                  }
                  Update: {
                    "category_code"?: string,"content_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_category_links_category_code_fkey"
      columns: ["category_code"]
isOneToOne: false
      referencedRelation: "recipe_categories"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "recipe_category_links_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_comments": {
                  Row: {
                    "body": string,"content_id": string,"created_at": string,"id": string,"moderated_at": string | null,"moderated_by": string | null,"moderation_reason": string | null,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"content_id": string,"created_at"?: string,"id"?: string,"moderated_at"?: string | null,"moderated_by"?: string | null,"moderation_reason"?: string | null,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "body"?: string,"content_id"?: string,"created_at"?: string,"id"?: string,"moderated_at"?: string | null,"moderated_by"?: string | null,"moderation_reason"?: string | null,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_comments_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_details": {
                  Row: {
                    "allergen_notes": string | null,"allergens": (string)[],"allergens_declared": boolean,"content_id": string,"cook_minutes": number | null,"cover_media_id": string | null,"created_at": string,"diets": (string)[],"prep_minutes": number | null,"rating_count": number,"rating_sum": number,"rest_minutes": number | null,"schema_version": number,"servings": number | null,"story": string | null,"total_minutes": number | null,"updated_at": string,"yield_text": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "allergen_notes"?: string | null,"allergens"?: (string)[],"allergens_declared"?: boolean,"content_id": string,"cook_minutes"?: number | null,"cover_media_id"?: string | null,"created_at"?: string,"diets"?: (string)[],"prep_minutes"?: number | null,"rating_count"?: number,"rating_sum"?: number,"rest_minutes"?: number | null,"schema_version"?: number,"servings"?: number | null,"story"?: string | null,"total_minutes"?: number | null,"updated_at"?: string,"yield_text"?: string | null
                  }
                  Update: {
                    "allergen_notes"?: string | null,"allergens"?: (string)[],"allergens_declared"?: boolean,"content_id"?: string,"cook_minutes"?: number | null,"cover_media_id"?: string | null,"created_at"?: string,"diets"?: (string)[],"prep_minutes"?: number | null,"rating_count"?: number,"rating_sum"?: number,"rest_minutes"?: number | null,"schema_version"?: number,"servings"?: number | null,"story"?: string | null,"total_minutes"?: number | null,"updated_at"?: string,"yield_text"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_details_content_id_fkey"
      columns: ["content_id"]
isOneToOne: true
      referencedRelation: "content"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_details_cover_fk"
      columns: ["cover_media_id","content_id"]
isOneToOne: false
      referencedRelation: "recipe_media"
      referencedColumns: ["id","content_id"]
    }
                  ]
                },"recipe_extras": {
                  Row: {
                    "chef_note": string | null,"content_id": string,"ingredient_terms": unknown,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chef_note"?: string | null,"content_id": string,"ingredient_terms"?: unknown,"updated_at"?: string
                  }
                  Update: {
                    "chef_note"?: string | null,"content_id"?: string,"ingredient_terms"?: unknown,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_extras_content_id_fkey"
      columns: ["content_id"]
isOneToOne: true
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_ingredient_products": {
                  Row: {
                    "content_id": string,"created_at": string,"id": string,"ingredient_id": string,"note": string | null,"product_id": string,"product_version_at_validation": number | null,"status": Database["public"]['Enums']["link_status"],"suspended_reason": string | null,"updated_at": string,"validated_at": string | null,"validated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id": string,"created_at"?: string,"id"?: string,"ingredient_id": string,"note"?: string | null,"product_id": string,"product_version_at_validation"?: number | null,"status"?: Database["public"]['Enums']["link_status"],"suspended_reason"?: string | null,"updated_at"?: string,"validated_at"?: string | null,"validated_by"?: string | null
                  }
                  Update: {
                    "content_id"?: string,"created_at"?: string,"id"?: string,"ingredient_id"?: string,"note"?: string | null,"product_id"?: string,"product_version_at_validation"?: number | null,"status"?: Database["public"]['Enums']["link_status"],"suspended_reason"?: string | null,"updated_at"?: string,"validated_at"?: string | null,"validated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_ingredient_products_ingredient_fk"
      columns: ["ingredient_id","content_id"]
isOneToOne: false
      referencedRelation: "recipe_ingredients"
      referencedColumns: ["id","content_id"]
    },{
      foreignKeyName: "recipe_ingredient_products_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_ingredients": {
                  Row: {
                    "content_id": string,"created_at": string,"id": string,"name": string,"note": string | null,"optional": boolean,"position": number,"quantity": number | null,"quantity_text": string | null,"source_qty": string | null,"substitutions": NonNullable<Json>,"to_taste": boolean,"unit": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id": string,"created_at"?: string,"id"?: string,"name": string,"note"?: string | null,"optional"?: boolean,"position": number,"quantity"?: number | null,"quantity_text"?: string | null,"source_qty"?: string | null,"substitutions"?: NonNullable<Json>,"to_taste"?: boolean,"unit"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "content_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"note"?: string | null,"optional"?: boolean,"position"?: number,"quantity"?: number | null,"quantity_text"?: string | null,"source_qty"?: string | null,"substitutions"?: NonNullable<Json>,"to_taste"?: boolean,"unit"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_ingredients_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_media": {
                  Row: {
                    "alt_text": string | null,"bytes": number,"caption": string | null,"content_id": string,"created_at": string,"created_by": string | null,"creator_id": string,"height": number | null,"id": string,"mime": string,"position": number,"rights_confirmed_at": string,"role": string,"storage_path": string,"updated_at": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_text"?: string | null,"bytes": number,"caption"?: string | null,"content_id": string,"created_at"?: string,"created_by"?: string | null,"creator_id": string,"height"?: number | null,"id"?: string,"mime": string,"position"?: number,"rights_confirmed_at": string,"role": string,"storage_path": string,"updated_at"?: string,"width"?: number | null
                  }
                  Update: {
                    "alt_text"?: string | null,"bytes"?: number,"caption"?: string | null,"content_id"?: string,"created_at"?: string,"created_by"?: string | null,"creator_id"?: string,"height"?: number | null,"id"?: string,"mime"?: string,"position"?: number,"rights_confirmed_at"?: string,"role"?: string,"storage_path"?: string,"updated_at"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_media_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_media_creator_id_fkey"
      columns: ["creator_id"]
isOneToOne: false
      referencedRelation: "creator_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_nutrition": {
                  Row: {
                    "carbs_g": number | null,"content_id": string,"fat_g": number | null,"fiber_g": number | null,"kcal": number | null,"protein_g": number | null,"sodium_mg": number | null,"source": string,"source_note": string | null,"updated_at": string,"validated": boolean,"validated_at": string | null,"validated_by": string | null,"validated_by_user": string | null,"validation_note": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "carbs_g"?: number | null,"content_id": string,"fat_g"?: number | null,"fiber_g"?: number | null,"kcal"?: number | null,"protein_g"?: number | null,"sodium_mg"?: number | null,"source"?: string,"source_note"?: string | null,"updated_at"?: string,"validated"?: boolean,"validated_at"?: string | null,"validated_by"?: string | null,"validated_by_user"?: string | null,"validation_note"?: string | null
                  }
                  Update: {
                    "carbs_g"?: number | null,"content_id"?: string,"fat_g"?: number | null,"fiber_g"?: number | null,"kcal"?: number | null,"protein_g"?: number | null,"sodium_mg"?: number | null,"source"?: string,"source_note"?: string | null,"updated_at"?: string,"validated"?: boolean,"validated_at"?: string | null,"validated_by"?: string | null,"validated_by_user"?: string | null,"validation_note"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_nutrition_content_id_fkey"
      columns: ["content_id"]
isOneToOne: true
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_onboarding": {
                  Row: {
                    "allergies": (string)[],"completed_at": string,"notice_accepted_at": string,"restrictions": (string)[],"updated_at": string,"user_id": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "allergies"?: (string)[],"completed_at"?: string,"notice_accepted_at": string,"restrictions"?: (string)[],"updated_at"?: string,"user_id": string,"version"?: number
                  }
                  Update: {
                    "allergies"?: (string)[],"completed_at"?: string,"notice_accepted_at"?: string,"restrictions"?: (string)[],"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                },"recipe_ratings": {
                  Row: {
                    "content_id": string,"created_at": string,"is_demo": boolean,"stars": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id": string,"created_at"?: string,"is_demo"?: boolean,"stars": number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "content_id"?: string,"created_at"?: string,"is_demo"?: boolean,"stars"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_ratings_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_step_ingredients": {
                  Row: {
                    "content_id": string,"ingredient_id": string,"step_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id": string,"ingredient_id": string,"step_id": string
                  }
                  Update: {
                    "content_id"?: string,"ingredient_id"?: string,"step_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_step_ingredients_ingredient_fk"
      columns: ["ingredient_id","content_id"]
isOneToOne: false
      referencedRelation: "recipe_ingredients"
      referencedColumns: ["id","content_id"]
    },{
      foreignKeyName: "recipe_step_ingredients_step_fk"
      columns: ["step_id","content_id"]
isOneToOne: false
      referencedRelation: "recipe_steps"
      referencedColumns: ["id","content_id"]
    }
                  ]
                },"recipe_steps": {
                  Row: {
                    "content_id": string,"created_at": string,"duration_seconds": number | null,"id": string,"image_media_id": string | null,"instruction": string,"position": number,"temperature_c": number | null,"tip": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id": string,"created_at"?: string,"duration_seconds"?: number | null,"id"?: string,"image_media_id"?: string | null,"instruction": string,"position": number,"temperature_c"?: number | null,"tip"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "content_id"?: string,"created_at"?: string,"duration_seconds"?: number | null,"id"?: string,"image_media_id"?: string | null,"instruction"?: string,"position"?: number,"temperature_c"?: number | null,"tip"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_steps_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_steps_image_fk"
      columns: ["image_media_id","content_id"]
isOneToOne: false
      referencedRelation: "recipe_media"
      referencedColumns: ["id","content_id"]
    }
                  ]
                },"recipe_versions": {
                  Row: {
                    "changed_sections": (string)[],"content_id": string,"created_at": string,"created_by": string | null,"id": string,"reason": string,"snapshot": NonNullable<Json>,"snapshot_hash": string,"version_no": number
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_sections"?: (string)[],"content_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"reason": string,"snapshot": NonNullable<Json>,"snapshot_hash": string,"version_no": number
                  }
                  Update: {
                    "changed_sections"?: (string)[],"content_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"reason"?: string,"snapshot"?: NonNullable<Json>,"snapshot_hash"?: string,"version_no"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_versions_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_view_history": {
                  Row: {
                    "content_id": string,"user_id": string,"viewed_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id": string,"user_id"?: string,"viewed_at"?: string
                  }
                  Update: {
                    "content_id"?: string,"user_id"?: string,"viewed_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_view_history_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                },"recommendation_runs": {
                  Row: {
                    "candidates": number | null,"cost_estimate_usd": number | null,"created_at": string,"engine": string,"error": string | null,"id": string,"input_tokens": number | null,"latency_ms": number | null,"output_tokens": number | null,"provider_model": string | null,"returned": number | null,"trigger": string,"user_id": string | null,"valid_rate": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "candidates"?: number | null,"cost_estimate_usd"?: number | null,"created_at"?: string,"engine": string,"error"?: string | null,"id"?: string,"input_tokens"?: number | null,"latency_ms"?: number | null,"output_tokens"?: number | null,"provider_model"?: string | null,"returned"?: number | null,"trigger": string,"user_id"?: string | null,"valid_rate"?: number | null
                  }
                  Update: {
                    "candidates"?: number | null,"cost_estimate_usd"?: number | null,"created_at"?: string,"engine"?: string,"error"?: string | null,"id"?: string,"input_tokens"?: number | null,"latency_ms"?: number | null,"output_tokens"?: number | null,"provider_model"?: string | null,"returned"?: number | null,"trigger"?: string,"user_id"?: string | null,"valid_rate"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"retention_exceptions": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"created_by": string | null,"id": string,"owner_id": string | null,"reason": string,"review_at": string,"scope_id": string,"scope_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"owner_id"?: string | null,"reason": string,"review_at": string,"scope_id": string,"scope_type": string
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"owner_id"?: string | null,"reason"?: string,"review_at"?: string,"scope_id"?: string,"scope_type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"retention_jobs": {
                  Row: {
                    "affected": number,"details": Json | null,"id": number,"job": string,"ran_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "affected"?: number,"details"?: Json | null,"id"?: never,"job": string,"ran_at"?: string
                  }
                  Update: {
                    "affected"?: number,"details"?: Json | null,"id"?: never,"job"?: string,"ran_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"role_assignments": {
                  Row: {
                    "created_at": string,"granted_by": string | null,"id": string,"revoked_at": string | null,"role": Database["public"]['Enums']["app_role"],"scope_id": string | null,"scope_type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"granted_by"?: string | null,"id"?: string,"revoked_at"?: string | null,"role": Database["public"]['Enums']["app_role"],"scope_id"?: string | null,"scope_type"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"granted_by"?: string | null,"id"?: string,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"scope_id"?: string | null,"scope_type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"routine_checks": {
                  Row: {
                    "checked_at": string,"done": boolean,"item_id": string,"local_date": string,"timezone": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_at"?: string,"done"?: boolean,"item_id": string,"local_date": string,"timezone": string,"user_id": string
                  }
                  Update: {
                    "checked_at"?: string,"done"?: boolean,"item_id"?: string,"local_date"?: string,"timezone"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "routine_checks_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "routine_items"
      referencedColumns: ["id"]
    }
                  ]
                },"routine_items": {
                  Row: {
                    "active": boolean,"content_id": string | null,"created_at": string,"id": string,"note": string | null,"sort_order": number,"time_of_day": string | null,"title": string,"updated_at": string,"user_id": string,"weekdays": (number)[] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"content_id"?: string | null,"created_at"?: string,"id"?: string,"note"?: string | null,"sort_order"?: number,"time_of_day"?: string | null,"title": string,"updated_at"?: string,"user_id": string,"weekdays"?: (number)[] | null
                  }
                  Update: {
                    "active"?: boolean,"content_id"?: string | null,"created_at"?: string,"id"?: string,"note"?: string | null,"sort_order"?: number,"time_of_day"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string,"weekdays"?: (number)[] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "routine_items_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_memberships": {
                  Row: {
                    "created_at": string,"id": string,"org_id": string,"revoked_at": string | null,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"org_id": string,"revoked_at"?: string | null,"role"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"org_id"?: string,"revoked_at"?: string | null,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_memberships_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "seller_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_organizations": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_fictional": boolean,"kind": string,"logo_url": string | null,"name": string,"slug": string,"status": Database["public"]['Enums']["partner_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_fictional"?: boolean,"kind": string,"logo_url"?: string | null,"name": string,"slug": string,"status"?: Database["public"]['Enums']["partner_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_fictional"?: boolean,"kind"?: string,"logo_url"?: string | null,"name"?: string,"slug"?: string,"status"?: Database["public"]['Enums']["partner_status"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"shopping_list_items": {
                  Row: {
                    "checked": boolean,"content_id": string | null,"created_at": string,"id": string,"ingredient_id": string | null,"name": string,"position": number,"product_id": string | null,"quantity": number | null,"quantity_text": string | null,"unit": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checked"?: boolean,"content_id"?: string | null,"created_at"?: string,"id"?: string,"ingredient_id"?: string | null,"name": string,"position"?: number,"product_id"?: string | null,"quantity"?: number | null,"quantity_text"?: string | null,"unit"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "checked"?: boolean,"content_id"?: string | null,"created_at"?: string,"id"?: string,"ingredient_id"?: string | null,"name"?: string,"position"?: number,"product_id"?: string | null,"quantity"?: number | null,"quantity_text"?: string | null,"unit"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shopping_list_items_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shopping_list_items_ingredient_id_fkey"
      columns: ["ingredient_id"]
isOneToOne: false
      referencedRelation: "recipe_ingredients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shopping_list_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"simulated_subscriptions": {
                  Row: {
                    "auto_renew": boolean,"cancelled_at": string | null,"created_at": string,"current_period_end": string,"current_period_start": string,"id": string,"status": Database["public"]['Enums']["subscription_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_renew"?: boolean,"cancelled_at"?: string | null,"created_at"?: string,"current_period_end"?: string,"current_period_start"?: string,"id"?: string,"status"?: Database["public"]['Enums']["subscription_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "auto_renew"?: boolean,"cancelled_at"?: string | null,"created_at"?: string,"current_period_end"?: string,"current_period_start"?: string,"id"?: string,"status"?: Database["public"]['Enums']["subscription_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"streak_events": {
                  Row: {
                    "id": number,"kind": string,"local_date": string,"occurred_at": string,"ref_id": string | null,"timezone": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"kind": string,"local_date": string,"occurred_at"?: string,"ref_id"?: string | null,"timezone": string,"user_id": string
                  }
                  Update: {
                    "id"?: never,"kind"?: string,"local_date"?: string,"occurred_at"?: string,"ref_id"?: string | null,"timezone"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"stream_uploads": {
                  Row: {
                    "checked_at": string | null,"content_id": string | null,"created_at": string,"creator_id": string,"discarded_at": string | null,"expires_at": string,"provider_deleted_at": string | null,"uid": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_at"?: string | null,"content_id"?: string | null,"created_at"?: string,"creator_id": string,"discarded_at"?: string | null,"expires_at": string,"provider_deleted_at"?: string | null,"uid": string
                  }
                  Update: {
                    "checked_at"?: string | null,"content_id"?: string | null,"created_at"?: string,"creator_id"?: string,"discarded_at"?: string | null,"expires_at"?: string,"provider_deleted_at"?: string | null,"uid"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stream_uploads_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stream_uploads_creator_id_fkey"
      columns: ["creator_id"]
isOneToOne: false
      referencedRelation: "creator_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"subscription_events": {
                  Row: {
                    "created_at": string,"event": string,"id": number,"payload": NonNullable<Json>,"subscription_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event": string,"id"?: never,"payload"?: NonNullable<Json>,"subscription_id": string
                  }
                  Update: {
                    "created_at"?: string,"event"?: string,"id"?: never,"payload"?: NonNullable<Json>,"subscription_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_events_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "simulated_subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"subscription_modules": {
                  Row: {
                    "activated_at": string,"module_id": string,"removal_at": string | null,"status": string,"subscription_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activated_at"?: string,"module_id": string,"removal_at"?: string | null,"status"?: string,"subscription_id": string
                  }
                  Update: {
                    "activated_at"?: string,"module_id"?: string,"removal_at"?: string | null,"status"?: string,"subscription_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_modules_module_id_fkey"
      columns: ["module_id"]
isOneToOne: false
      referencedRelation: "plan_modules"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscription_modules_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "simulated_subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"test_fulfillments": {
                  Row: {
                    "created_at": string,"destination_zone": string,"eta_days": number | null,"id": string,"order_id": string,"seller_name_snapshot": string,"seller_org_id": string,"shipping_cents_snapshot": number,"status": Database["public"]['Enums']["fulfillment_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"destination_zone": string,"eta_days"?: number | null,"id"?: string,"order_id": string,"seller_name_snapshot": string,"seller_org_id": string,"shipping_cents_snapshot"?: number,"status"?: Database["public"]['Enums']["fulfillment_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"destination_zone"?: string,"eta_days"?: number | null,"id"?: string,"order_id"?: string,"seller_name_snapshot"?: string,"seller_org_id"?: string,"shipping_cents_snapshot"?: number,"status"?: Database["public"]['Enums']["fulfillment_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "test_fulfillments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "test_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "test_fulfillments_seller_org_id_fkey"
      columns: ["seller_org_id"]
isOneToOne: false
      referencedRelation: "seller_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"test_order_items": {
                  Row: {
                    "fulfillment_id": string,"id": string,"image_snapshot": string | null,"order_id": string,"price_cents_snapshot": number,"product_id": string | null,"product_version_snapshot": number | null,"quantity": number,"seller_org_id": string,"title_snapshot": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fulfillment_id": string,"id"?: string,"image_snapshot"?: string | null,"order_id": string,"price_cents_snapshot": number,"product_id"?: string | null,"product_version_snapshot"?: number | null,"quantity": number,"seller_org_id": string,"title_snapshot": string
                  }
                  Update: {
                    "fulfillment_id"?: string,"id"?: string,"image_snapshot"?: string | null,"order_id"?: string,"price_cents_snapshot"?: number,"product_id"?: string | null,"product_version_snapshot"?: number | null,"quantity"?: number,"seller_org_id"?: string,"title_snapshot"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "test_order_items_fulfillment_id_fkey"
      columns: ["fulfillment_id"]
isOneToOne: false
      referencedRelation: "test_fulfillments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "test_order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "test_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "test_order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "test_order_items_seller_org_id_fkey"
      columns: ["seller_org_id"]
isOneToOne: false
      referencedRelation: "seller_organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"test_orders": {
                  Row: {
                    "anonymized_at": string | null,"completed_at": string | null,"confirmed_at": string,"created_at": string,"destination_snapshot": NonNullable<Json>,"id": string,"is_demo": boolean,"retention_expires_at": string,"shipping_cents": number,"status": Database["public"]['Enums']["order_status"],"subtotal_cents": number,"total_cents": number,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "anonymized_at"?: string | null,"completed_at"?: string | null,"confirmed_at"?: string,"created_at"?: string,"destination_snapshot": NonNullable<Json>,"id"?: string,"is_demo"?: boolean,"retention_expires_at"?: string,"shipping_cents": number,"status"?: Database["public"]['Enums']["order_status"],"subtotal_cents": number,"total_cents": number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "anonymized_at"?: string | null,"completed_at"?: string | null,"confirmed_at"?: string,"created_at"?: string,"destination_snapshot"?: NonNullable<Json>,"id"?: string,"is_demo"?: boolean,"retention_expires_at"?: string,"shipping_cents"?: number,"status"?: Database["public"]['Enums']["order_status"],"subtotal_cents"?: number,"total_cents"?: number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"user_achievements": {
                  Row: {
                    "achievement_id": string,"earned_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "achievement_id": string,"earned_at"?: string,"user_id": string
                  }
                  Update: {
                    "achievement_id"?: string,"earned_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_achievements_achievement_id_fkey"
      columns: ["achievement_id"]
isOneToOne: false
      referencedRelation: "achievements"
      referencedColumns: ["id"]
    }
                  ]
                },"user_interests": {
                  Row: {
                    "created_at": string,"tag": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"tag": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"tag"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_interests_tag_fkey"
      columns: ["tag"]
isOneToOne: false
      referencedRelation: "interest_tags"
      referencedColumns: ["tag"]
    }
                  ]
                },"user_recipe_prefs": {
                  Row: {
                    "history_enabled": boolean,"history_enabled_at": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "history_enabled"?: boolean,"history_enabled_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "history_enabled"?: boolean,"history_enabled_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_recommendations": {
                  Row: {
                    "content_id": string,"engine": string,"generated_at": string,"is_fallback": boolean,"rank": number,"reason": string | null,"score": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_id": string,"engine": string,"generated_at"?: string,"is_fallback"?: boolean,"rank": number,"reason"?: string | null,"score"?: number | null,"user_id": string
                  }
                  Update: {
                    "content_id"?: string,"engine"?: string,"generated_at"?: string,"is_fallback"?: boolean,"rank"?: number,"reason"?: string | null,"score"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_recommendations_content_id_fkey"
      columns: ["content_id"]
isOneToOne: false
      referencedRelation: "content"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: Json
                           },
"admin_advance_transport":
{ Args: { "p_minutes"?: number }; Returns: number
                           },
"admin_create_invitation":
{ Args: { "p_creator_profile_id"?: string,"p_days"?: number,"p_email": string,"p_role": Database["public"]['Enums']["app_role"],"p_seller_org_id"?: string }; Returns: {
              "invitation_id": string,"token": string
            }[]
                           },
"admin_create_program_version":
{ Args: { "p_copy_from"?: string,"p_program": string }; Returns: string
                           },
"admin_get_user":
{ Args: { "p_id": string }; Returns: {
              "anonymized": boolean,"avatar_url": string,"banned_until": string,"created_at": string,"display_name": string,"email": string,"id": string,"last_sign_in_at": string,"locale": Database["public"]['Enums']["locale_code"],"roles": Json,"timezone": string
            }[]
                           },
"admin_list_admins":
{ Args: Record<PropertyKey, never>; Returns: {
              "display_name": string,"email": string,"id": string
            }[]
                           },
"admin_list_users":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_search"?: string }; Returns: {
              "anonymized": boolean,"created_at": string,"display_name": string,"email": string,"id": string,"last_sign_in_at": string,"roles": (string)[]
            }[]
                           },
"admin_log_account_status":
{ Args: { "p_justification": string,"p_suspended": boolean,"p_user": string }; Returns: undefined
                           },
"admin_metrics":
{ Args: { "p_days"?: number }; Returns: Json
                           },
"admin_moderate_product":
{ Args: { "p_action": string,"p_product": string,"p_reason"?: string }; Returns: undefined
                           },
"admin_moderate_recipe_comment":
{ Args: { "p_comment": string,"p_decision": string,"p_reason": string }; Returns: undefined
                           },
"admin_publish_program_version":
{ Args: { "p_version": string }; Returns: undefined
                           },
"admin_review_content":
{ Args: { "p_content": string,"p_decision": Database["public"]['Enums']["review_status"],"p_feedback"?: string }; Returns: undefined
                           } |
{ Args: { "p_content": string,"p_decision": Database["public"]['Enums']["review_status"],"p_feedback": string,"p_publish_at": string }; Returns: undefined
                           },
"admin_revoke_invitation":
{ Args: { "p_id": string,"p_justification"?: string }; Returns: undefined
                           },
"admin_revoke_membership":
{ Args: { "p_justification"?: string,"p_membership": string }; Returns: undefined
                           },
"admin_run_retention":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_set_content_status":
{ Args: { "p_content": string,"p_justification"?: string,"p_status": Database["public"]['Enums']["content_status"] }; Returns: undefined
                           } |
{ Args: { "p_content": string,"p_justification": string,"p_publish_at": string,"p_status": Database["public"]['Enums']["content_status"] }; Returns: undefined
                           },
"admin_set_creator_credentials":
{ Args: { "p_approved": boolean,"p_creator": string,"p_expected_text"?: string,"p_reason": string }; Returns: undefined
                           },
"admin_set_creator_product":
{ Args: { "p_creator": string,"p_note"?: string,"p_product": string,"p_sort"?: number,"p_status": Database["public"]['Enums']["link_status"] }; Returns: string
                           },
"admin_set_creator_recipe":
{ Args: { "p_content": string,"p_creator": string,"p_sort"?: number,"p_status": Database["public"]['Enums']["link_status"] }; Returns: string
                           },
"admin_set_creator_rights_private":
{ Args: { "p_creator": string,"p_document_ref": string,"p_justification"?: string,"p_notes": string }; Returns: undefined
                           },
"admin_set_creator_status":
{ Args: { "p_creator": string,"p_justification"?: string,"p_status": Database["public"]['Enums']["partner_status"] }; Returns: undefined
                           },
"admin_set_featured":
{ Args: { "p_featured": boolean,"p_id": string,"p_kind": string,"p_rank"?: number }; Returns: undefined
                           },
"admin_set_ingredient_product":
{ Args: { "p_link": string,"p_note": string,"p_status": Database["public"]['Enums']["link_status"] }; Returns: undefined
                           },
"admin_set_link_status":
{ Args: { "p_link": string,"p_note"?: string,"p_status": Database["public"]['Enums']["link_status"] }; Returns: undefined
                           },
"admin_set_review_required":
{ Args: { "p_on": boolean,"p_reason": string,"p_type": Database["public"]['Enums']["content_type"] }; Returns: undefined
                           },
"admin_set_role":
{ Args: { "p_active": boolean,"p_justification"?: string,"p_role": Database["public"]['Enums']["app_role"],"p_user": string }; Returns: undefined
                           },
"admin_set_seller_status":
{ Args: { "p_justification"?: string,"p_org": string,"p_status": Database["public"]['Enums']["partner_status"] }; Returns: undefined
                           },
"admin_set_setting":
{ Args: { "p_justification"?: string,"p_key": string,"p_value": Json }; Returns: undefined
                           },
"admin_substitute_program_item":
{ Args: { "p_original": string,"p_reason": string,"p_replacement": string,"p_version": string }; Returns: undefined
                           },
"admin_triage_feedback":
{ Args: { "p_id": string,"p_justification"?: string,"p_patch": Json }; Returns: Json
                           },
"admin_upsert_recipe_category":
{ Args: { "p_active": boolean,"p_code": string,"p_name": Json,"p_sort": number }; Returns: undefined
                           },
"admin_user_emails":
{ Args: { "p_ids": (string)[] }; Returns: {
              "display_name": string,"email": string,"id": string
            }[]
                           },
"admin_validate_recipe_nutrition":
{ Args: { "p_at": string,"p_by": string,"p_content": string,"p_note": string,"p_validated": boolean }; Returns: undefined
                           },
"advance_simulated_transport":
{ Args: { "p_minutes_per_step"?: number }; Returns: number
                           },
"anonymize_user_data":
{ Args: { "p_user": string }; Returns: undefined
                           },
"audit_actor":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["actor_type"]
                           },
"audit_log":
{ Args: { "p_action": string,"p_actor_type"?: Database["public"]['Enums']["actor_type"],"p_after"?: Json,"p_before"?: Json,"p_justification"?: string,"p_resource_id": string,"p_resource_type": string }; Returns: undefined
                           },
"avatar_orphan_uploads":
{ Args: { "p_limit": number }; Returns: string[]
                           },
"avatar_set_photo":
{ Args: { "p_url": string }; Returns: (string)[]
                           },
"avatar_upload_claim":
{ Args: { "p_bytes": number,"p_mime": string }; Returns: string
                           },
"can_access_content":
{ Args: { "p_content": string }; Returns: boolean
                           },
"cancel_subscription":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"cancel_test_order":
{ Args: { "p_order": string }; Returns: undefined
                           },
"cart_set_item":
{ Args: { "p_product": string,"p_quantity": number }; Returns: undefined
                           },
"cart_validate":
{ Args: { "p_expected"?: Json }; Returns: Json
                           },
"check_program_completion":
{ Args: { "p_enrollment": string }; Returns: Json
                           },
"checkout_cart":
{ Args: { "p_accept_changes"?: boolean,"p_destination": string,"p_expected"?: Json }; Returns: string
                           },
"checkout_create_fulfillment":
{ Args: { "p_eta": number,"p_order": string,"p_seller": string,"p_seller_name": string,"p_shipping_share": number,"p_user": string,"p_zone": string }; Returns: string
                           },
"complete_content":
{ Args: { "p_content": string,"p_source"?: string,"p_timezone": string }; Returns: Json
                           },
"compute_streak":
{ Args: { "p_timezone"?: string,"p_user": string }; Returns: number
                           },
"content_assert_media_license":
{ Args: { "p_content": string }; Returns: undefined
                           },
"content_is_live":
{ Args: { "p_publish_at": string,"p_status": Database["public"]['Enums']["content_status"] }; Returns: boolean
                           },
"content_localized_body":
{ Args: { "p_content": string,"p_locale": Database["public"]['Enums']["locale_code"] }; Returns: Json
                           },
"content_review_required":
{ Args: { "p_type": Database["public"]['Enums']["content_type"] }; Returns: boolean
                           },
"creator_archive_content":
{ Args: { "p_content": string,"p_reason": string }; Returns: Json
                           },
"creator_delete_recipe":
{ Args: { "p_content": string }; Returns: Json
                           },
"creator_delete_recipe_draft":
{ Args: { "p_content": string }; Returns: Json
                           },
"creator_discard_video_draft":
{ Args: { "p_content": string }; Returns: Json
                           },
"creator_duplicate_recipe":
{ Args: { "p_content": string,"p_slug": string,"p_title": string }; Returns: string
                           },
"creator_publish_content":
{ Args: { "p_content": string }; Returns: Json
                           } |
{ Args: { "p_content": string,"p_publish_at": string }; Returns: Json
                           },
"creator_recipe_stats":
{ Args: { "p_days"?: number }; Returns: {
              "content_id": string,"favorites": number,"rating_avg": number,"rating_count": number,"visitors": number
            }[]
                           },
"creator_restore_content":
{ Args: { "p_content": string }; Returns: Json
                           },
"creator_restore_recipe_version":
{ Args: { "p_version": string }; Returns: Json
                           },
"creator_set_draft_slug":
{ Args: { "p_content": string,"p_slug": string }; Returns: Json
                           },
"creator_suggest_ingredient_product":
{ Args: { "p_ingredient": string,"p_note": string,"p_product": string }; Returns: string
                           },
"creator_unpublish_content":
{ Args: { "p_content": string }; Returns: Json
                           },
"creator_withdraw_ingredient_product":
{ Args: { "p_link": string }; Returns: undefined
                           },
"creator_withdraw_review":
{ Args: { "p_content": string }; Returns: Json
                           },
"delete_my_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"enroll_program":
{ Args: { "p_program": string,"p_timezone"?: string }; Returns: string
                           },
"evaluate_achievements":
{ Args: { "p_timezone"?: string,"p_user": string }; Returns: string[]
                           },
"explore_feed":
{ Args: { "p_access"?: Database["public"]['Enums']["access_level"],"p_difficulty"?: string,"p_limit"?: number,"p_offset"?: number,"p_pillar"?: Database["public"]['Enums']["pillar"],"p_seed"?: number,"p_type"?: Database["public"]['Enums']["content_type"] }; Returns: {
              "access_level": Database["public"]['Enums']["access_level"] | null,
"archived_at": string | null,
"archived_by": string | null,
"completion_mode": Database["public"]['Enums']["completion_mode"] | null,
"cover_url": string | null,
"created_at": string,
"created_by": string | null,
"creator_id": string | null,
"creator_link_origin": string | null,
"difficulty": string | null,
"disclaimer_kind": string | null,
"duration_minutes": number | null,
"featured_rank": number | null,
"has_captions": boolean,
"id": string,
"is_featured": boolean,
"media_credit": string | null,
"media_license_kind": string,
"media_license_ref": string | null,
"pillar": Database["public"]['Enums']["pillar"],
"publish_at": string | null,
"published_at": string | null,
"required_module_id": string | null,
"review_status": Database["public"]['Enums']["review_status"],
"search": unknown,
"slug": string,
"source_locale": Database["public"]['Enums']["locale_code"],
"status": Database["public"]['Enums']["content_status"],
"summary": string | null,
"tags": (string)[],
"title": string,
"type": Database["public"]['Enums']["content_type"],
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "content"
        isOneToOne: false
        isSetofReturn: true
      } },
"f_unaccent":
{ Args: { "": string }; Returns: string
                           },
"fulfillment_transition":
{ Args: { "p_fulfillment": string,"p_note"?: string,"p_to": Database["public"]['Enums']["fulfillment_status"] }; Returns: undefined
                           },
"has_role":
{ Args: { "p_role": Database["public"]['Enums']["app_role"] }; Returns: boolean
                           },
"health_consent_grant":
{ Args: { "p_age_confirmed": boolean,"p_categories": (string)[],"p_locale": string,"p_version": string }; Returns: Json
                           },
"health_consent_reduce":
{ Args: { "p_categories": (string)[] }; Returns: Json
                           },
"health_consent_revoke":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"health_consent_text":
{ Args: { "p_locale": string }; Returns: Json
                           },
"health_run_retention":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_seller_of":
{ Args: { "p_org": string }; Returns: boolean
                           },
"is_trusted_call":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"local_date_for":
{ Args: { "p_timezone": string }; Returns: string
                           },
"media_license_compatible":
{ Args: { "p_kind": string,"p_provider": Database["public"]['Enums']["media_provider"] }; Returns: boolean
                           },
"my_creator_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_entitled_modules":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"my_health_consent":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_health_today":
{ Args: { "p_days"?: number,"p_until": string }; Returns: Json
                           },
"my_roles":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_seller_org_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"my_subscription":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_wearable_connections":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"product_is_purchasable":
{ Args: { "p_product": string }; Returns: boolean
                           },
"program_required_items":
{ Args: { "p_version": string }; Returns: {
              "content_id": string,"is_required": boolean,"item_position": number,"original_content_id": string,"section": string,"substituted": boolean
            }[]
                           },
"public_settings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"quote_shipping":
{ Args: { "p_seller_count": number,"p_subtotal": number,"p_zone": string }; Returns: number
                           },
"recipe_assert_publishable":
{ Args: { "p_content": string }; Returns: undefined
                           },
"recipe_backfill_dry_run":
{ Args: Record<PropertyKey, never>; Returns: {
              "content_id": string,"kind": string,"original": string,"outcome": string,"pos": number,"seed_key": string,"slug": string
            }[]
                           },
"recipe_backfill_legacy":
{ Args: { "p_content": string }; Returns: string
                           },
"recipe_catalog":
{ Args: { "p_categories"?: (string)[],"p_creator"?: string,"p_cursor"?: string,"p_diets"?: (string)[],"p_difficulty"?: string,"p_exclude_allergens"?: (string)[],"p_limit"?: number,"p_max_minutes"?: number,"p_query"?: string,"p_sort"?: string }; Returns: {
              "content_id": string,"cursor": string,"rank": number
            }[]
                           },
"recipe_delete_media":
{ Args: { "p_media": string }; Returns: Json
                           },
"recipe_legacy_allergen_code":
{ Args: { "p_label": string }; Returns: string
                           },
"recipe_legacy_category_literals":
{ Args: Record<PropertyKey, never>; Returns: {
              "category_code": string,"seed_key": string
            }[]
                           },
"recipe_legacy_ingredient_literals":
{ Args: Record<PropertyKey, never>; Returns: {
              "item": string,"note": string,"pos": number,"qty": string,"quantity": number,"quantity_text": string,"seed_key": string,"to_taste": boolean,"unit": string
            }[]
                           },
"recipe_legacy_seed_key":
{ Args: { "p_content": string }; Returns: string
                           },
"recipe_legacy_step_literals":
{ Args: Record<PropertyKey, never>; Returns: {
              "duration_seconds": number,"instruction": string,"pos": number,"seed_key": string,"temperature_c": number
            }[]
                           },
"recipe_media_path_ok":
{ Args: { "p_name": string }; Returns: boolean
                           },
"recipe_media_quota_ok":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"recipe_media_registered":
{ Args: { "p_name": string }; Returns: boolean
                           },
"recipe_orphan_media":
{ Args: { "p_limit": number }; Returns: string[]
                           },
"recipe_payload_bool":
{ Args: { "p_default": boolean,"p_key": string,"p_obj": Json,"p_path": string }; Returns: boolean
                           },
"recipe_payload_list":
{ Args: { "p_allowed": (string)[],"p_key": string,"p_max_items": number,"p_max_len": number,"p_obj": Json,"p_path": string }; Returns: (string)[]
                           },
"recipe_payload_num":
{ Args: { "p_integer"?: boolean,"p_key": string,"p_max": number,"p_min": number,"p_obj": Json,"p_path": string,"p_required"?: boolean }; Returns: number
                           },
"recipe_payload_text":
{ Args: { "p_key": string,"p_max": number,"p_obj": Json,"p_path": string,"p_required"?: boolean }; Returns: string
                           },
"recipe_payload_uuid":
{ Args: { "p_key": string,"p_obj": Json,"p_path": string,"p_required"?: boolean }; Returns: string
                           },
"recipe_publishable_missing":
{ Args: { "p_content": string,"p_cover_url": string,"p_creator": string,"p_license": string,"p_summary": string,"p_title": string }; Returns: (string)[]
                           },
"recipe_rating_allowed":
{ Args: { "p_content": string }; Returns: boolean
                           },
"recipe_register_media":
{ Args: { "p_alt": string,"p_content": string,"p_height": number,"p_path": string,"p_rights": boolean,"p_role": string,"p_width": number }; Returns: string
                           },
"recipe_save":
{ Args: { "p_content": string,"p_expected_updated_at": string,"p_payload": Json }; Returns: Json
                           },
"recipe_setting_on":
{ Args: { "p_key": string }; Returns: boolean
                           },
"recipe_snapshot":
{ Args: { "p_content": string,"p_reason": string }; Returns: string
                           },
"recompute_order_status":
{ Args: { "p_order": string }; Returns: undefined
                           },
"routine_check":
{ Args: { "p_done"?: boolean,"p_item": string,"p_timezone": string }; Returns: Json
                           },
"run_retention":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"search_content":
{ Args: { "p_access"?: Database["public"]['Enums']["access_level"],"p_creator"?: string,"p_difficulty"?: string,"p_limit"?: number,"p_offset"?: number,"p_pillar"?: Database["public"]['Enums']["pillar"],"p_query": string,"p_type"?: Database["public"]['Enums']["content_type"] }; Returns: {
              "access_level": Database["public"]['Enums']["access_level"] | null,
"archived_at": string | null,
"archived_by": string | null,
"completion_mode": Database["public"]['Enums']["completion_mode"] | null,
"cover_url": string | null,
"created_at": string,
"created_by": string | null,
"creator_id": string | null,
"creator_link_origin": string | null,
"difficulty": string | null,
"disclaimer_kind": string | null,
"duration_minutes": number | null,
"featured_rank": number | null,
"has_captions": boolean,
"id": string,
"is_featured": boolean,
"media_credit": string | null,
"media_license_kind": string,
"media_license_ref": string | null,
"pillar": Database["public"]['Enums']["pillar"],
"publish_at": string | null,
"published_at": string | null,
"required_module_id": string | null,
"review_status": Database["public"]['Enums']["review_status"],
"search": unknown,
"slug": string,
"source_locale": Database["public"]['Enums']["locale_code"],
"status": Database["public"]['Enums']["content_status"],
"summary": string | null,
"tags": (string)[],
"title": string,
"type": Database["public"]['Enums']["content_type"],
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "content"
        isOneToOne: false
        isSetofReturn: true
      } },
"seed_uuid":
{ Args: { "p": string }; Returns: string
                           },
"select_modules":
{ Args: { "p_module_ids": (string)[] }; Returns: Json
                           },
"setting":
{ Args: { "p_key": string }; Returns: Json
                           },
"slugify":
{ Args: { "p": string }; Returns: string
                           },
"stream_cleanup_candidates":
{ Args: { "p_cutoff": string,"p_limit": number }; Returns: {
              "draft_id": string,"referenced": boolean,"uid": string
            }[]
                           },
"stream_cleanup_discard":
{ Args: { "p_draft": string,"p_uid": string }; Returns: boolean
                           },
"submit_content_for_review":
{ Args: { "p_content": string }; Returns: undefined
                           } |
{ Args: { "p_content": string,"p_requested_publish_at": string }; Returns: undefined
                           },
"submit_feedback":
{ Args: { "p_context": string,"p_locale"?: Database["public"]['Enums']["locale_code"],"p_message": string,"p_rating": number }; Returns: string
                           } |
{ Args: { "p_category": string,"p_context": string,"p_locale": Database["public"]['Enums']["locale_code"],"p_message": string,"p_rating": number }; Returns: string
                           },
"sync_all_subscriptions":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"sync_subscription":
{ Args: { "p_user": string }; Returns: undefined
                           },
"track_event":
{ Args: { "p_anon_id"?: string,"p_event": string,"p_locale"?: Database["public"]['Enums']["locale_code"],"p_properties"?: Json }; Returns: undefined
                           },
"track_progress":
{ Args: { "p_content": string,"p_position_seconds": number,"p_progress_pct": number,"p_timezone": string }; Returns: Json
                           },
"user_entitled_modules":
{ Args: { "p_user": string }; Returns: string[]
                           },
"verify_certificate":
{ Args: { "p_code": string }; Returns: Json
                           },
"wearable_disconnect":
{ Args: { "p_connection": string }; Returns: Json
                           }
          }
          Enums: {
            "access_level": "free"|"premium","actor_type": "consumer"|"creator"|"seller"|"admin"|"system","app_role": "consumer"|"creator"|"seller"|"admin","availability": "available"|"unavailable","completion_mode": "manual"|"auto","content_status": "draft"|"published"|"archived","content_type": "video"|"recipe"|"workout"|"guide"|"article","enrollment_status": "active"|"completed"|"abandoned","fulfillment_status": "awaiting"|"preparing"|"ready_for_dispatch"|"in_transit"|"delivered"|"cancelled"|"failed","invitation_status": "pending"|"accepted"|"expired"|"revoked","link_status": "suggested"|"validated"|"suspended"|"rejected","locale_code": "pt-BR"|"en"|"es","media_provider": "none"|"embed_youtube"|"embed_vimeo"|"cloudflare_stream"|"mux"|"upload","moderation_status": "clear"|"hidden"|"suspended","order_status": "confirmed"|"in_progress"|"completed"|"partially_completed"|"cancelled"|"failed","partner_status": "pending"|"active"|"suspended","pillar": "routine"|"training"|"nutrition"|"gastronomy","product_status": "draft"|"published"|"archived","review_status": "none"|"in_review"|"returned"|"approved"|"rejected","subscription_status": "active"|"cancelled"|"expired"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "access_level": ["free", "premium"],"actor_type": ["consumer", "creator", "seller", "admin", "system"],"app_role": ["consumer", "creator", "seller", "admin"],"availability": ["available", "unavailable"],"completion_mode": ["manual", "auto"],"content_status": ["draft", "published", "archived"],"content_type": ["video", "recipe", "workout", "guide", "article"],"enrollment_status": ["active", "completed", "abandoned"],"fulfillment_status": ["awaiting", "preparing", "ready_for_dispatch", "in_transit", "delivered", "cancelled", "failed"],"invitation_status": ["pending", "accepted", "expired", "revoked"],"link_status": ["suggested", "validated", "suspended", "rejected"],"locale_code": ["pt-BR", "en", "es"],"media_provider": ["none", "embed_youtube", "embed_vimeo", "cloudflare_stream", "mux", "upload"],"moderation_status": ["clear", "hidden", "suspended"],"order_status": ["confirmed", "in_progress", "completed", "partially_completed", "cancelled", "failed"],"partner_status": ["pending", "active", "suspended"],"pillar": ["routine", "training", "nutrition", "gastronomy"],"product_status": ["draft", "published", "archived"],"review_status": ["none", "in_review", "returned", "approved", "rejected"],"subscription_status": ["active", "cancelled", "expired"]
          }
        }
} as const
