export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_period_balances: {
        Row: {
          account_code: string
          credit: number
          debit: number
          period_no: number
          tenant_id: string
          updated_at: string
          year: number
        }
        Insert: {
          account_code: string
          credit?: number
          debit?: number
          period_no: number
          tenant_id: string
          updated_at?: string
          year: number
        }
        Update: {
          account_code?: string
          credit?: number
          debit?: number
          period_no?: number
          tenant_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      agent_feedback_events: {
        Row: {
          bank_transaction_id: string | null
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          journal_entry_id: string | null
          note: string | null
          processed_at: string
          proposal_id: string | null
          severity: number
          signals_snapshot: Json
          source_agent: string
          target_agent: string
          tenant_id: string
        }
        Insert: {
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          journal_entry_id?: string | null
          note?: string | null
          processed_at?: string
          proposal_id?: string | null
          severity?: number
          signals_snapshot?: Json
          source_agent: string
          target_agent?: string
          tenant_id: string
        }
        Update: {
          bank_transaction_id?: string | null
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          journal_entry_id?: string | null
          note?: string | null
          processed_at?: string
          proposal_id?: string | null
          severity?: number
          signals_snapshot?: Json
          source_agent?: string
          target_agent?: string
          tenant_id?: string
        }
        Relationships: []
      }
      ai_actions: {
        Row: {
          approved_at: string | null
          created_at: string
          error_message: string | null
          executed_at: string | null
          id: string
          input: Json
          result: Json | null
          result_ref_id: string | null
          result_ref_table: string | null
          status: string
          summary: string
          tenant_id: string | null
          tool_name: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          input?: Json
          result?: Json | null
          result_ref_id?: string | null
          result_ref_table?: string | null
          status?: string
          summary: string
          tenant_id?: string | null
          tool_name: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          input?: Json
          result?: Json | null
          result_ref_id?: string | null
          result_ref_table?: string | null
          status?: string
          summary?: string
          tenant_id?: string | null
          tool_name?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_agent_activity_logs: {
        Row: {
          action: string
          agent_id: string
          created_at: string
          duration_ms: number | null
          id: string
          metadata: Json | null
          result: string
          tenant_id: string
        }
        Insert: {
          action: string
          agent_id: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          metadata?: Json | null
          result?: string
          tenant_id: string
        }
        Update: {
          action?: string
          agent_id?: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          metadata?: Json | null
          result?: string
          tenant_id?: string
        }
        Relationships: []
      }
      ai_agent_models: {
        Row: {
          agent_key: string
          description: string | null
          is_active: boolean
          label: string
          max_tokens: number | null
          model_name: string | null
          provider_id: string | null
          purpose: string
          temperature: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agent_key: string
          description?: string | null
          is_active?: boolean
          label: string
          max_tokens?: number | null
          model_name?: string | null
          provider_id?: string | null
          purpose: string
          temperature?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agent_key?: string
          description?: string | null
          is_active?: boolean
          label?: string
          max_tokens?: number | null
          model_name?: string | null
          provider_id?: string | null
          purpose?: string
          temperature?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_models_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          agent_id: string
          confidence_profile: string
          confidence_threshold: number
          created_at: string
          enabled: boolean
          id: string
          mode: string
          notify_on: Json
          schedule: Json
          status: string
          status_message: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          confidence_profile?: string
          confidence_threshold?: number
          created_at?: string
          enabled?: boolean
          id?: string
          mode?: string
          notify_on?: Json
          schedule?: Json
          status?: string
          status_message?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          confidence_profile?: string
          confidence_threshold?: number
          created_at?: string
          enabled?: boolean
          id?: string
          mode?: string
          notify_on?: Json
          schedule?: Json
          status?: string
          status_message?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_insights: {
        Row: {
          action_url: string | null
          body: string | null
          category: string
          created_at: string
          dedupe_key: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          id: string
          metadata: Json
          severity: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          category: string
          created_at?: string
          dedupe_key?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          metadata?: Json
          severity?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          category?: string
          created_at?: string
          dedupe_key?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          metadata?: Json
          severity?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_journal_proposals: {
        Row: {
          auto_posted: boolean
          confidence: number
          created_at: string
          dto: Json
          id: string
          invoice_id: string
          invoice_kind: string
          journal_entry_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          signals: Json
          source: string
          status: string
          tenant_id: string
          updated_at: string
          warnings: Json
        }
        Insert: {
          auto_posted?: boolean
          confidence?: number
          created_at?: string
          dto: Json
          id?: string
          invoice_id: string
          invoice_kind?: string
          journal_entry_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          signals?: Json
          source: string
          status?: string
          tenant_id: string
          updated_at?: string
          warnings?: Json
        }
        Update: {
          auto_posted?: boolean
          confidence?: number
          created_at?: string
          dto?: Json
          id?: string
          invoice_id?: string
          invoice_kind?: string
          journal_entry_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          signals?: Json
          source?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          warnings?: Json
        }
        Relationships: []
      }
      ai_line_classifications: {
        Row: {
          account: string
          created_at: string
          created_by: string | null
          hit_count: number
          id: string
          kind: string
          kind_v2: string | null
          last_used_at: string
          line_name: string
          line_name_norm: string
          source: string
          supplier_id: string | null
          supplier_tax_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account: string
          created_at?: string
          created_by?: string | null
          hit_count?: number
          id?: string
          kind: string
          kind_v2?: string | null
          last_used_at?: string
          line_name: string
          line_name_norm: string
          source?: string
          supplier_id?: string | null
          supplier_tax_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account?: string
          created_at?: string
          created_by?: string | null
          hit_count?: number
          id?: string
          kind?: string
          kind_v2?: string | null
          last_used_at?: string
          line_name?: string
          line_name_norm?: string
          source?: string
          supplier_id?: string | null
          supplier_tax_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_memory_context: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          key: string
          label: string
          order_index: number
          source: string
          source_field: string | null
          tenant_id: string
          updated_at: string
          value_json: Json | null
          value_text: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          key: string
          label: string
          order_index?: number
          source?: string
          source_field?: string | null
          tenant_id: string
          updated_at?: string
          value_json?: Json | null
          value_text: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          key?: string
          label?: string
          order_index?: number
          source?: string
          source_field?: string | null
          tenant_id?: string
          updated_at?: string
          value_json?: Json | null
          value_text?: string
        }
        Relationships: []
      }
      ai_memory_graph_layout: {
        Row: {
          created_at: string
          id: string
          positions: Json
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          positions?: Json
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          positions?: Json
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_memory_limits: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_triggered_at: string | null
          limit_kind: string
          params: Json
          rule_text: string
          scope: string
          severity: string
          tenant_id: string
          title: string
          triggered_count: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          limit_kind: string
          params?: Json
          rule_text: string
          scope: string
          severity?: string
          tenant_id: string
          title: string
          triggered_count?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          limit_kind?: string
          params?: Json
          rule_text?: string
          scope?: string
          severity?: string
          tenant_id?: string
          title?: string
          triggered_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_memory_partners: {
        Row: {
          bank_hints: string[]
          behavior_text: string
          confidence: number
          created_at: string
          created_by: string | null
          default_account: string | null
          default_dept_id: string | null
          default_project_id: string | null
          display_name: string
          id: string
          last_seen_at: string | null
          memo_keywords: string[]
          party_id: string | null
          party_kind: string
          sample_count: number
          tags: string[]
          template_lines: Json | null
          template_version: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          bank_hints?: string[]
          behavior_text: string
          confidence?: number
          created_at?: string
          created_by?: string | null
          default_account?: string | null
          default_dept_id?: string | null
          default_project_id?: string | null
          display_name: string
          id?: string
          last_seen_at?: string | null
          memo_keywords?: string[]
          party_id?: string | null
          party_kind: string
          sample_count?: number
          tags?: string[]
          template_lines?: Json | null
          template_version?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          bank_hints?: string[]
          behavior_text?: string
          confidence?: number
          created_at?: string
          created_by?: string | null
          default_account?: string | null
          default_dept_id?: string | null
          default_project_id?: string | null
          display_name?: string
          id?: string
          last_seen_at?: string | null
          memo_keywords?: string[]
          party_id?: string | null
          party_kind?: string
          sample_count?: number
          tags?: string[]
          template_lines?: Json | null
          template_version?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_memory_rules: {
        Row: {
          accuracy_correct: number
          accuracy_total: number
          actions: Json
          applied_count: number
          applies_to: string
          conditions: Json
          confidence_threshold: number
          created_at: string
          created_by: string
          disable_reason: string | null
          enabled: boolean
          id: string
          last_used_at: string | null
          mode: string
          origin: string | null
          paused_reason: string | null
          previous_version_id: string | null
          schema_version: number
          source: string | null
          status: string
          tenant_id: string
          then_text: string
          title: string
          type: string
          updated_at: string
          version: number
          when_text: string
        }
        Insert: {
          accuracy_correct?: number
          accuracy_total?: number
          actions?: Json
          applied_count?: number
          applies_to?: string
          conditions?: Json
          confidence_threshold?: number
          created_at?: string
          created_by?: string
          disable_reason?: string | null
          enabled?: boolean
          id?: string
          last_used_at?: string | null
          mode?: string
          origin?: string | null
          paused_reason?: string | null
          previous_version_id?: string | null
          schema_version?: number
          source?: string | null
          status?: string
          tenant_id: string
          then_text: string
          title: string
          type: string
          updated_at?: string
          version?: number
          when_text: string
        }
        Update: {
          accuracy_correct?: number
          accuracy_total?: number
          actions?: Json
          applied_count?: number
          applies_to?: string
          conditions?: Json
          confidence_threshold?: number
          created_at?: string
          created_by?: string
          disable_reason?: string | null
          enabled?: boolean
          id?: string
          last_used_at?: string | null
          mode?: string
          origin?: string | null
          paused_reason?: string | null
          previous_version_id?: string | null
          schema_version?: number
          source?: string | null
          status?: string
          tenant_id?: string
          then_text?: string
          title?: string
          type?: string
          updated_at?: string
          version?: number
          when_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_memory_rules_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "ai_memory_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_memory_watch: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          seen_count: number
          target_count: number
          tenant_id: string
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          seen_count?: number
          target_count?: number
          tenant_id: string
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          seen_count?: number
          target_count?: number
          tenant_id?: string
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_model_config: {
        Row: {
          api_key_encrypted: string | null
          base_url: string
          enabled: boolean
          extra_headers: Json
          id: number
          model_chat: string | null
          model_classify: string | null
          model_default: string
          model_parse: string | null
          model_reasoning: string | null
          notes: string | null
          provider_label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          api_key_encrypted?: string | null
          base_url?: string
          enabled?: boolean
          extra_headers?: Json
          id?: number
          model_chat?: string | null
          model_classify?: string | null
          model_default?: string
          model_parse?: string | null
          model_reasoning?: string | null
          notes?: string | null
          provider_label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          api_key_encrypted?: string | null
          base_url?: string
          enabled?: boolean
          extra_headers?: Json
          id?: number
          model_chat?: string | null
          model_classify?: string | null
          model_default?: string
          model_parse?: string | null
          model_reasoning?: string | null
          notes?: string | null
          provider_label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_parse_cache: {
        Row: {
          created_at: string
          file_hash: string
          hit_count: number
          id: string
          kind: string
          last_hit_at: string
          pages: number | null
          parsed: Json
          parser_used: string | null
        }
        Insert: {
          created_at?: string
          file_hash: string
          hit_count?: number
          id?: string
          kind: string
          last_hit_at?: string
          pages?: number | null
          parsed: Json
          parser_used?: string | null
        }
        Update: {
          created_at?: string
          file_hash?: string
          hit_count?: number
          id?: string
          kind?: string
          last_hit_at?: string
          pages?: number | null
          parsed?: Json
          parser_used?: string | null
        }
        Relationships: []
      }
      ai_providers: {
        Row: {
          api_key_encrypted: string | null
          base_url: string
          code: string
          created_at: string
          enabled: boolean
          extra_headers: Json
          id: string
          is_default: boolean
          label: string
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          api_key_encrypted?: string | null
          base_url: string
          code: string
          created_at?: string
          enabled?: boolean
          extra_headers?: Json
          id?: string
          is_default?: boolean
          label: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          api_key_encrypted?: string | null
          base_url?: string
          code?: string
          created_at?: string
          enabled?: boolean
          extra_headers?: Json
          id?: string
          is_default?: boolean
          label?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_rule_applications: {
        Row: {
          ai_log: Json
          applied_at: string
          applied_by: string | null
          created_at: string
          document_id: string | null
          document_label: string | null
          document_table: string | null
          id: string
          journal_code: string | null
          journal_entry_id: string | null
          rule_id: string
          source_id: string | null
          source_kind: string
          status: string
          tenant_id: string
          then_snapshot: string
          undo_reason: string | null
          undone_at: string | null
          undone_by: string | null
        }
        Insert: {
          ai_log?: Json
          applied_at?: string
          applied_by?: string | null
          created_at?: string
          document_id?: string | null
          document_label?: string | null
          document_table?: string | null
          id?: string
          journal_code?: string | null
          journal_entry_id?: string | null
          rule_id: string
          source_id?: string | null
          source_kind?: string
          status?: string
          tenant_id: string
          then_snapshot: string
          undo_reason?: string | null
          undone_at?: string | null
          undone_by?: string | null
        }
        Update: {
          ai_log?: Json
          applied_at?: string
          applied_by?: string | null
          created_at?: string
          document_id?: string | null
          document_label?: string | null
          document_table?: string | null
          id?: string
          journal_code?: string | null
          journal_entry_id?: string | null
          rule_id?: string
          source_id?: string | null
          source_kind?: string
          status?: string
          tenant_id?: string
          then_snapshot?: string
          undo_reason?: string | null
          undone_at?: string | null
          undone_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_rule_applications_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_rule_applications_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "ai_memory_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_rule_penalties: {
        Row: {
          auto_demoted_at: string | null
          auto_demoted_reason: string | null
          created_at: string
          id: string
          last_event_id: string | null
          last_penalty_at: string | null
          penalty_score: number
          target_id: string
          target_kind: string
          tenant_id: string
          updated_at: string
          wrong_count: number
        }
        Insert: {
          auto_demoted_at?: string | null
          auto_demoted_reason?: string | null
          created_at?: string
          id?: string
          last_event_id?: string | null
          last_penalty_at?: string | null
          penalty_score?: number
          target_id: string
          target_kind: string
          tenant_id: string
          updated_at?: string
          wrong_count?: number
        }
        Update: {
          auto_demoted_at?: string | null
          auto_demoted_reason?: string | null
          created_at?: string
          id?: string
          last_event_id?: string | null
          last_penalty_at?: string | null
          penalty_score?: number
          target_id?: string
          target_kind?: string
          tenant_id?: string
          updated_at?: string
          wrong_count?: number
        }
        Relationships: []
      }
      ai_suggestions: {
        Row: {
          chosen_index: number | null
          created_at: string
          feedback: string | null
          id: string
          invoice_id: string
          suggestions: Json
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          chosen_index?: number | null
          created_at?: string
          feedback?: string | null
          id?: string
          invoice_id: string
          suggestions: Json
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          chosen_index?: number | null
          created_at?: string
          feedback?: string | null
          id?: string
          invoice_id?: string
          suggestions?: Json
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_uploads: {
        Row: {
          classify_meta: Json | null
          created_at: string
          error: string | null
          file_hash: string | null
          file_path: string | null
          filename: string | null
          id: string
          kind: string
          mime_type: string | null
          pages: number | null
          parsed: Json | null
          parser_ms: number | null
          parser_used: string | null
          status: string
          structurer_ms: number | null
          user_id: string
        }
        Insert: {
          classify_meta?: Json | null
          created_at?: string
          error?: string | null
          file_hash?: string | null
          file_path?: string | null
          filename?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          pages?: number | null
          parsed?: Json | null
          parser_ms?: number | null
          parser_used?: string | null
          status?: string
          structurer_ms?: number | null
          user_id: string
        }
        Update: {
          classify_meta?: Json | null
          created_at?: string
          error?: string | null
          file_hash?: string | null
          file_path?: string | null
          filename?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          pages?: number | null
          parsed?: Json | null
          parser_ms?: number | null
          parser_used?: string | null
          status?: string
          structurer_ms?: number | null
          user_id?: string
        }
        Relationships: []
      }
      allocated_asset_adjustments: {
        Row: {
          adj_date: string
          asset_id: string
          created_at: string
          delta_cost: number
          delta_periods: number
          id: string
          journal_entry_id: string | null
          reason: string | null
          type: string
        }
        Insert: {
          adj_date: string
          asset_id: string
          created_at?: string
          delta_cost?: number
          delta_periods?: number
          id?: string
          journal_entry_id?: string | null
          reason?: string | null
          type: string
        }
        Update: {
          adj_date?: string
          asset_id?: string
          created_at?: string
          delta_cost?: number
          delta_periods?: number
          id?: string
          journal_entry_id?: string | null
          reason?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocated_asset_adjustments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "allocated_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocated_asset_adjustments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      allocated_asset_targets: {
        Row: {
          asset_id: string
          created_at: string
          expense_account: string | null
          id: string
          ratio_percent: number
          target_ref_id: string
          target_type: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          expense_account?: string | null
          id?: string
          ratio_percent?: number
          target_ref_id: string
          target_type: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          expense_account?: string | null
          id?: string
          ratio_percent?: number
          target_ref_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocated_asset_targets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "allocated_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      allocated_assets: {
        Row: {
          allocated: number
          branch_id: string | null
          category: string
          code: string
          cost: number
          cost_center_id: string | null
          created_at: string
          department_id: string | null
          expense_account: string
          id: string
          method: string
          name: string
          notes: string | null
          period_unit: string
          periods_done: number
          periods_total: number
          prepaid_account: string
          project_id: string | null
          quantity: number
          source_doc_id: string | null
          source_doc_table: string | null
          source_type: string
          start_date: string
          status: string
          tenant_id: string
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allocated?: number
          branch_id?: string | null
          category?: string
          code: string
          cost: number
          cost_center_id?: string | null
          created_at?: string
          department_id?: string | null
          expense_account?: string
          id?: string
          method?: string
          name: string
          notes?: string | null
          period_unit?: string
          periods_done?: number
          periods_total: number
          prepaid_account?: string
          project_id?: string | null
          quantity?: number
          source_doc_id?: string | null
          source_doc_table?: string | null
          source_type?: string
          start_date: string
          status?: string
          tenant_id: string
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allocated?: number
          branch_id?: string | null
          category?: string
          code?: string
          cost?: number
          cost_center_id?: string | null
          created_at?: string
          department_id?: string | null
          expense_account?: string
          id?: string
          method?: string
          name?: string
          notes?: string | null
          period_unit?: string
          periods_done?: number
          periods_total?: number
          prepaid_account?: string
          project_id?: string | null
          quantity?: number
          source_doc_id?: string | null
          source_doc_table?: string | null
          source_type?: string
          start_date?: string
          status?: string
          tenant_id?: string
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocated_assets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocated_assets_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocated_assets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocated_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_entries: {
        Row: {
          amount: number
          asset_id: string
          created_at: string
          id: string
          journal_entry_id: string | null
          period_month: string
        }
        Insert: {
          amount: number
          asset_id: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          period_month: string
        }
        Update: {
          amount?: number
          asset_id?: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          period_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_entries_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "allocated_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_entries_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          ip: string | null
          record_id: string | null
          table_name: string | null
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          ip?: string | null
          record_id?: string | null
          table_name?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          ip?: string | null
          record_id?: string | null
          table_name?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_no: string | null
          balance_synced_at: string | null
          bank_name: string | null
          created_at: string
          currency: string
          current_balance: number | null
          gl_account_code: string
          id: string
          last_sync_error: string | null
          last_sync_status: string | null
          last_synced_at: string | null
          mb_corporate_id: string | null
          mb_password_enc: string | null
          mb_password_iv: string | null
          mb_username: string | null
          name: string
          opening_balance: number
          sync_enabled: boolean
          sync_interval_minutes: number
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          account_no?: string | null
          balance_synced_at?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          current_balance?: number | null
          gl_account_code?: string
          id?: string
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          mb_corporate_id?: string | null
          mb_password_enc?: string | null
          mb_password_iv?: string | null
          mb_username?: string | null
          name: string
          opening_balance?: number
          sync_enabled?: boolean
          sync_interval_minutes?: number
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          account_no?: string | null
          balance_synced_at?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          current_balance?: number | null
          gl_account_code?: string
          id?: string
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_synced_at?: string | null
          mb_corporate_id?: string | null
          mb_password_enc?: string | null
          mb_password_iv?: string | null
          mb_username?: string | null
          name?: string
          opening_balance?: number
          sync_enabled?: boolean
          sync_interval_minutes?: number
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bank_sync_logs: {
        Row: {
          bank_account_id: string
          created_at: string
          error_text: string | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
          tenant_id: string | null
          txn_fetched: number
          txn_new: number
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          tenant_id?: string | null
          txn_fetched?: number
          txn_new?: number
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          error_text?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          tenant_id?: string | null
          txn_fetched?: number
          txn_new?: number
        }
        Relationships: [
          {
            foreignKeyName: "bank_sync_logs_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          branch_id: string | null
          counterparty: string | null
          created_at: string
          description: string | null
          external_ref: string | null
          id: string
          match_confidence: number | null
          match_reason: string | null
          matched_entry_id: string | null
          running_balance: number | null
          status: string
          tenant_id: string | null
          txn_date: string
          user_id: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          branch_id?: string | null
          counterparty?: string | null
          created_at?: string
          description?: string | null
          external_ref?: string | null
          id?: string
          match_confidence?: number | null
          match_reason?: string | null
          matched_entry_id?: string | null
          running_balance?: number | null
          status?: string
          tenant_id?: string | null
          txn_date: string
          user_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          branch_id?: string | null
          counterparty?: string | null
          created_at?: string
          description?: string | null
          external_ref?: string | null
          id?: string
          match_confidence?: number | null
          match_reason?: string | null
          matched_entry_id?: string | null
          running_balance?: number | null
          status?: string
          tenant_id?: string | null
          txn_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_vouchers: {
        Row: {
          amount: number
          bank_account_id: string
          bank_transaction_id: string | null
          branch_id: string | null
          cost_center_id: string | null
          counter_account: string
          created_at: string
          file_hash: string | null
          id: string
          journal_entry_id: string | null
          party_id: string | null
          party_name: string | null
          posted_at: string | null
          project_id: string | null
          reason: string | null
          reference: string | null
          status: string
          tenant_id: string | null
          transfer_pair_id: string | null
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voucher_date: string
          voucher_no: string
          voucher_type: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          bank_transaction_id?: string | null
          branch_id?: string | null
          cost_center_id?: string | null
          counter_account: string
          created_at?: string
          file_hash?: string | null
          id?: string
          journal_entry_id?: string | null
          party_id?: string | null
          party_name?: string | null
          posted_at?: string | null
          project_id?: string | null
          reason?: string | null
          reference?: string | null
          status?: string
          tenant_id?: string | null
          transfer_pair_id?: string | null
          user_id: string
          void_reason?: string | null
          voided_at?: string | null
          voucher_date?: string
          voucher_no: string
          voucher_type: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          bank_transaction_id?: string | null
          branch_id?: string | null
          cost_center_id?: string | null
          counter_account?: string
          created_at?: string
          file_hash?: string | null
          id?: string
          journal_entry_id?: string | null
          party_id?: string | null
          party_name?: string | null
          posted_at?: string | null
          project_id?: string | null
          reason?: string | null
          reference?: string | null
          status?: string
          tenant_id?: string | null
          transfer_pair_id?: string | null
          user_id?: string
          void_reason?: string | null
          voided_at?: string | null
          voucher_date?: string
          voucher_no?: string
          voucher_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_vouchers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_vouchers_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_vouchers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          manager: string | null
          name: string
          phone: string | null
          tax_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          manager?: string | null
          name: string
          phone?: string | null
          tax_id?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          manager?: string | null
          name?: string
          phone?: string | null
          tax_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calibration_runs: {
        Row: {
          id: string
          metrics: Json
          new_threshold: number | null
          new_weights: Json | null
          note: string | null
          old_threshold: number | null
          old_weights: Json | null
          ran_at: string
          sample_size: number
          tenant_id: string
          window_days: number
        }
        Insert: {
          id?: string
          metrics?: Json
          new_threshold?: number | null
          new_weights?: Json | null
          note?: string | null
          old_threshold?: number | null
          old_weights?: Json | null
          ran_at?: string
          sample_size: number
          tenant_id: string
          window_days: number
        }
        Update: {
          id?: string
          metrics?: Json
          new_threshold?: number | null
          new_weights?: Json | null
          note?: string | null
          old_threshold?: number | null
          old_weights?: Json | null
          ran_at?: string
          sample_size?: number
          tenant_id?: string
          window_days?: number
        }
        Relationships: []
      }
      cash_vouchers: {
        Row: {
          amount: number
          branch_id: string | null
          cash_account: string
          cost_center_id: string | null
          counter_account: string
          created_at: string
          file_hash: string | null
          id: string
          journal_entry_id: string | null
          party_name: string | null
          posted_at: string | null
          project_id: string | null
          reason: string | null
          status: string
          tenant_id: string | null
          user_id: string
          void_reason: string | null
          voided_at: string | null
          voucher_date: string
          voucher_no: string
          voucher_type: string
        }
        Insert: {
          amount: number
          branch_id?: string | null
          cash_account?: string
          cost_center_id?: string | null
          counter_account: string
          created_at?: string
          file_hash?: string | null
          id?: string
          journal_entry_id?: string | null
          party_name?: string | null
          posted_at?: string | null
          project_id?: string | null
          reason?: string | null
          status?: string
          tenant_id?: string | null
          user_id: string
          void_reason?: string | null
          voided_at?: string | null
          voucher_date?: string
          voucher_no: string
          voucher_type: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          cash_account?: string
          cost_center_id?: string | null
          counter_account?: string
          created_at?: string
          file_hash?: string | null
          id?: string
          journal_entry_id?: string | null
          party_name?: string | null
          posted_at?: string | null
          project_id?: string | null
          reason?: string | null
          status?: string
          tenant_id?: string | null
          user_id?: string
          void_reason?: string | null
          voided_at?: string | null
          voucher_date?: string
          voucher_no?: string
          voucher_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_vouchers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_vouchers_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_vouchers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          code: string
          deprecated_in_version: number | null
          effective_from: string
          is_active: boolean
          level: number | null
          name: string
          parent_code: string | null
          status: string
          type: string
          version: number
        }
        Insert: {
          code: string
          deprecated_in_version?: number | null
          effective_from?: string
          is_active?: boolean
          level?: number | null
          name: string
          parent_code?: string | null
          status?: string
          type: string
          version?: number
        }
        Update: {
          code?: string
          deprecated_in_version?: number | null
          effective_from?: string
          is_active?: boolean
          level?: number | null
          name?: string
          parent_code?: string | null
          status?: string
          type?: string
          version?: number
        }
        Relationships: []
      }
      chart_of_accounts_tt133: {
        Row: {
          code: string
          is_active: boolean
          level: number | null
          name: string
          parent_code: string | null
          type: string
        }
        Insert: {
          code: string
          is_active?: boolean
          level?: number | null
          name: string
          parent_code?: string | null
          type: string
        }
        Update: {
          code?: string
          is_active?: boolean
          level?: number | null
          name?: string
          parent_code?: string | null
          type?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          tenant_id: string
          thread_id: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          tenant_id: string
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          tenant_id?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          inbox_external_id: string | null
          kind: string
          last_message_at: string
          pinned_at: string | null
          starred: boolean
          tenant_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inbox_external_id?: string | null
          kind?: string
          last_message_at?: string
          pinned_at?: string | null
          starred?: boolean
          tenant_id: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inbox_external_id?: string | null
          kind?: string
          last_message_at?: string
          pinned_at?: string | null
          starred?: boolean
          tenant_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      confidence_calibration: {
        Row: {
          accuracy_auto: number | null
          accuracy_review: number | null
          auto_threshold: number
          created_at: string
          last_calibrated_at: string | null
          review_threshold: number
          sample_size: number
          signal_weights: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accuracy_auto?: number | null
          accuracy_review?: number | null
          auto_threshold?: number
          created_at?: string
          last_calibrated_at?: string | null
          review_threshold?: number
          sample_size?: number
          signal_weights?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accuracy_auto?: number | null
          accuracy_review?: number | null
          auto_threshold?: number
          created_at?: string
          last_calibrated_at?: string | null
          review_threshold?: number
          sample_size?: number
          signal_weights?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      cost_centers: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_groups: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_groups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "customer_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_receipts: {
        Row: {
          amount: number
          branch_id: string | null
          cost_center_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          id: string
          invoice_id: string | null
          journal_entry_id: string | null
          method: string
          notes: string | null
          pay_date: string
          posted_at: string | null
          project_id: string | null
          reference: string | null
          status: string
          tenant_id: string | null
          user_id: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          amount: number
          branch_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          invoice_id?: string | null
          journal_entry_id?: string | null
          method?: string
          notes?: string | null
          pay_date?: string
          posted_at?: string | null
          project_id?: string | null
          reference?: string | null
          status?: string
          tenant_id?: string | null
          user_id: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          invoice_id?: string | null
          journal_entry_id?: string | null
          method?: string
          notes?: string | null
          pay_date?: string
          posted_at?: string | null
          project_id?: string | null
          reference?: string | null
          status?: string
          tenant_id?: string | null
          user_id?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_receipts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_invoice_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          bank_account_no: string | null
          bank_branch: string | null
          bank_name: string | null
          code: string | null
          contact_person: string | null
          created_at: string
          currency: string
          email: string | null
          email_cc: string | null
          fax: string | null
          group_id: string | null
          id: string
          is_active: boolean
          legal_rep: string | null
          name: string
          notes: string | null
          opening_balance: number
          opening_balance_credit: number
          opening_balance_debit: number
          party_type: string
          payment_terms_days: number
          phone: string | null
          receivable_account: string
          tax_id: string | null
          tenant_id: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          bank_account_no?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          code?: string | null
          contact_person?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          email_cc?: string | null
          fax?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          legal_rep?: string | null
          name: string
          notes?: string | null
          opening_balance?: number
          opening_balance_credit?: number
          opening_balance_debit?: number
          party_type?: string
          payment_terms_days?: number
          phone?: string | null
          receivable_account?: string
          tax_id?: string | null
          tenant_id?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string | null
          bank_account_no?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          code?: string | null
          contact_person?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          email_cc?: string | null
          fax?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean
          legal_rep?: string | null
          name?: string
          notes?: string | null
          opening_balance?: number
          opening_balance_credit?: number
          opening_balance_debit?: number
          party_type?: string
          payment_terms_days?: number
          phone?: string | null
          receivable_account?: string
          tax_id?: string | null
          tenant_id?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "customer_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          branch_id: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          manager: string | null
          name: string
          parent_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          manager?: string | null
          name: string
          parent_id?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          manager?: string | null
          name?: string
          parent_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      depreciation_entries: {
        Row: {
          amount: number
          asset_id: string
          book_id: string | null
          created_at: string
          id: string
          journal_entry_id: string | null
          period_month: string
          units: number | null
        }
        Insert: {
          amount: number
          asset_id: string
          book_id?: string | null
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          period_month: string
          units?: number | null
        }
        Update: {
          amount?: number
          asset_id?: string
          book_id?: string | null
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          period_month?: string
          units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "depreciation_entries_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depreciation_entries_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "fa_depreciation_books"
            referencedColumns: ["id"]
          },
        ]
      }
      document_links: {
        Row: {
          created_at: string
          document_id: string
          entity_id: string
          entity_table: string
          link_type: string
        }
        Insert: {
          created_at?: string
          document_id: string
          entity_id: string
          entity_table: string
          link_type?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          entity_id?: string
          entity_table?: string
          link_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          entity_id: string
          entity_table: string
          from_status: string | null
          id: string
          reason: string | null
          tenant_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          entity_id: string
          entity_table: string
          from_status?: string | null
          id?: string
          reason?: string | null
          tenant_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          entity_id?: string
          entity_table?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          tenant_id?: string
          to_status?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          ai_upload_id: string | null
          checksum_sha256: string | null
          created_at: string
          doc_kind: string
          einvoice_id: string | null
          id: string
          invoice_id: string | null
          mime_type: string | null
          notes: string | null
          ocr_error: string | null
          ocr_extracted: Json | null
          ocr_raw: Json | null
          ocr_status: string
          original_filename: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sales_invoice_id: string | null
          size_bytes: number | null
          source: string
          storage_bucket: string
          storage_path: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_upload_id?: string | null
          checksum_sha256?: string | null
          created_at?: string
          doc_kind: string
          einvoice_id?: string | null
          id?: string
          invoice_id?: string | null
          mime_type?: string | null
          notes?: string | null
          ocr_error?: string | null
          ocr_extracted?: Json | null
          ocr_raw?: Json | null
          ocr_status?: string
          original_filename?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_invoice_id?: string | null
          size_bytes?: number | null
          source?: string
          storage_bucket: string
          storage_path: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_upload_id?: string | null
          checksum_sha256?: string | null
          created_at?: string
          doc_kind?: string
          einvoice_id?: string | null
          id?: string
          invoice_id?: string | null
          mime_type?: string | null
          notes?: string | null
          ocr_error?: string | null
          ocr_extracted?: Json | null
          ocr_raw?: Json | null
          ocr_status?: string
          original_filename?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_invoice_id?: string | null
          size_bytes?: number | null
          source?: string
          storage_bucket?: string
          storage_path?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_ai_upload_id_fkey"
            columns: ["ai_upload_id"]
            isOneToOne: false
            referencedRelation: "ai_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_einvoice_id_fkey"
            columns: ["einvoice_id"]
            isOneToOne: false
            referencedRelation: "einvoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_sales_invoice_id_fkey"
            columns: ["sales_invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      einvoice_credentials: {
        Row: {
          created_at: string
          id: string
          last_login_at: string | null
          last_session_token: string | null
          tct_password_encrypted: string
          tct_username: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_login_at?: string | null
          last_session_token?: string | null
          tct_password_encrypted: string
          tct_username: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_login_at?: string | null
          last_session_token?: string | null
          tct_password_encrypted?: string
          tct_username?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      einvoice_journal_draft_lines: {
        Row: {
          account_code: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          draft_id: string
          id: string
          line_order: number
        }
        Insert: {
          account_code: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          draft_id: string
          id?: string
          line_order?: number
        }
        Update: {
          account_code?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          draft_id?: string
          id?: string
          line_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "einvoice_journal_draft_lines_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "einvoice_journal_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      einvoice_journal_drafts: {
        Row: {
          created_at: string
          description: string | null
          einvoice_id: string
          entry_date: string
          id: string
          posted_at: string | null
          posted_entry_id: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          einvoice_id: string
          entry_date: string
          id?: string
          posted_at?: string | null
          posted_entry_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          einvoice_id?: string
          entry_date?: string
          id?: string
          posted_at?: string | null
          posted_entry_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "einvoice_journal_drafts_einvoice_id_fkey"
            columns: ["einvoice_id"]
            isOneToOne: false
            referencedRelation: "einvoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einvoice_journal_drafts_posted_entry_id_fkey"
            columns: ["posted_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      einvoice_lines: {
        Row: {
          amount: number | null
          created_at: string
          description: string
          einvoice_id: string
          id: string
          line_no: number | null
          qty: number | null
          unit: string | null
          unit_price: number | null
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          description: string
          einvoice_id: string
          id?: string
          line_no?: number | null
          qty?: number | null
          unit?: string | null
          unit_price?: number | null
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          description?: string
          einvoice_id?: string
          id?: string
          line_no?: number | null
          qty?: number | null
          unit?: string | null
          unit_price?: number | null
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "einvoice_lines_einvoice_id_fkey"
            columns: ["einvoice_id"]
            isOneToOne: false
            referencedRelation: "einvoices"
            referencedColumns: ["id"]
          },
        ]
      }
      einvoice_sync_logs: {
        Row: {
          created_count: number | null
          date_from: string | null
          date_to: string | null
          direction: string | null
          duplicate_count: number | null
          error_message: string | null
          fetched_count: number | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_count?: number | null
          date_from?: string | null
          date_to?: string | null
          direction?: string | null
          duplicate_count?: number | null
          error_message?: string | null
          fetched_count?: number | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_count?: number | null
          date_from?: string | null
          date_to?: string | null
          direction?: string | null
          duplicate_count?: number | null
          error_message?: string | null
          fetched_count?: number | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "einvoice_sync_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      einvoices: {
        Row: {
          branch_id: string | null
          buyer_address: string | null
          buyer_name: string | null
          buyer_tax_id: string | null
          cost_center_id: string | null
          created_at: string
          currency: string | null
          department_id: string | null
          direction: string
          exchange_rate: number | null
          id: string
          invoice_no: string | null
          invoice_series: string | null
          invoice_template: string | null
          issue_date: string | null
          matched_at: string | null
          matched_purchase_invoice_id: string | null
          matched_sales_invoice_id: string | null
          notes: string | null
          pdf_path: string | null
          posted_at: string | null
          project_id: string | null
          seller_address: string | null
          seller_name: string | null
          seller_tax_id: string | null
          source: string
          status: string
          subtotal: number | null
          suggestion_dismissed: boolean
          tct_lookup_code: string | null
          tct_mcct: string | null
          tct_raw: Json | null
          tct_signed_at: string | null
          tct_status: string | null
          tenant_id: string
          total: number | null
          updated_at: string
          user_id: string
          vat_amount: number | null
          void_reason: string | null
          voided_at: string | null
          xml_fetch_error: string | null
          xml_fetch_status: string
          xml_fetched_at: string | null
          xml_path: string | null
        }
        Insert: {
          branch_id?: string | null
          buyer_address?: string | null
          buyer_name?: string | null
          buyer_tax_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string | null
          department_id?: string | null
          direction: string
          exchange_rate?: number | null
          id?: string
          invoice_no?: string | null
          invoice_series?: string | null
          invoice_template?: string | null
          issue_date?: string | null
          matched_at?: string | null
          matched_purchase_invoice_id?: string | null
          matched_sales_invoice_id?: string | null
          notes?: string | null
          pdf_path?: string | null
          posted_at?: string | null
          project_id?: string | null
          seller_address?: string | null
          seller_name?: string | null
          seller_tax_id?: string | null
          source?: string
          status?: string
          subtotal?: number | null
          suggestion_dismissed?: boolean
          tct_lookup_code?: string | null
          tct_mcct?: string | null
          tct_raw?: Json | null
          tct_signed_at?: string | null
          tct_status?: string | null
          tenant_id: string
          total?: number | null
          updated_at?: string
          user_id: string
          vat_amount?: number | null
          void_reason?: string | null
          voided_at?: string | null
          xml_fetch_error?: string | null
          xml_fetch_status?: string
          xml_fetched_at?: string | null
          xml_path?: string | null
        }
        Update: {
          branch_id?: string | null
          buyer_address?: string | null
          buyer_name?: string | null
          buyer_tax_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string | null
          department_id?: string | null
          direction?: string
          exchange_rate?: number | null
          id?: string
          invoice_no?: string | null
          invoice_series?: string | null
          invoice_template?: string | null
          issue_date?: string | null
          matched_at?: string | null
          matched_purchase_invoice_id?: string | null
          matched_sales_invoice_id?: string | null
          notes?: string | null
          pdf_path?: string | null
          posted_at?: string | null
          project_id?: string | null
          seller_address?: string | null
          seller_name?: string | null
          seller_tax_id?: string | null
          source?: string
          status?: string
          subtotal?: number | null
          suggestion_dismissed?: boolean
          tct_lookup_code?: string | null
          tct_mcct?: string | null
          tct_raw?: Json | null
          tct_signed_at?: string | null
          tct_status?: string | null
          tenant_id?: string
          total?: number | null
          updated_at?: string
          user_id?: string
          vat_amount?: number | null
          void_reason?: string | null
          voided_at?: string | null
          xml_fetch_error?: string | null
          xml_fetch_status?: string
          xml_fetched_at?: string | null
          xml_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "einvoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einvoices_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einvoices_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einvoices_matched_purchase_invoice_id_fkey"
            columns: ["matched_purchase_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einvoices_matched_sales_invoice_id_fkey"
            columns: ["matched_sales_invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einvoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einvoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_contracts: {
        Row: {
          attachment_url: string | null
          base_salary: number
          contract_no: string
          contract_type: string
          created_at: string
          employee_id: string
          end_date: string | null
          fixed_allowance: number
          id: string
          insurance_salary: number
          notes: string | null
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          base_salary?: number
          contract_no: string
          contract_type?: string
          created_at?: string
          employee_id: string
          end_date?: string | null
          fixed_allowance?: number
          id?: string
          insurance_salary?: number
          notes?: string | null
          start_date: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          base_salary?: number
          contract_no?: string
          contract_type?: string
          created_at?: string
          employee_id?: string
          end_date?: string | null
          fixed_allowance?: number
          id?: string
          insurance_salary?: number
          notes?: string | null
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_dependents: {
        Row: {
          citizen_id: string | null
          created_at: string
          deduction_end: string | null
          deduction_start: string
          dob: string | null
          employee_id: string
          full_name: string
          id: string
          notes: string | null
          registration_status: string
          relationship: string
          tax_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          citizen_id?: string | null
          created_at?: string
          deduction_end?: string | null
          deduction_start: string
          dob?: string | null
          employee_id: string
          full_name: string
          id?: string
          notes?: string | null
          registration_status?: string
          relationship: string
          tax_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          citizen_id?: string | null
          created_at?: string
          deduction_end?: string | null
          deduction_start?: string
          dob?: string | null
          employee_id?: string
          full_name?: string
          id?: string
          notes?: string | null
          registration_status?: string
          relationship?: string
          tax_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_dependents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_salary_structures: {
        Row: {
          amount: number
          component_id: string
          created_at: string
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          notes: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          component_id: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id: string
          id?: string
          notes?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          component_id?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_salary_structures_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "salary_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salary_structures_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salary_structures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_branch: string | null
          bank_name: string | null
          base_salary: number
          branch_id: string | null
          citizen_id: string | null
          citizen_id_date: string | null
          citizen_id_place: string | null
          code: string
          contract_no: string | null
          contract_type: string | null
          created_at: string
          department: string | null
          department_id: string | null
          dependents: number
          dob: string | null
          email: string | null
          end_date: string | null
          ethnicity: string | null
          full_name: string
          gender: string | null
          health_insurance_no: string | null
          hire_date: string | null
          id: string
          insurance_salary: number
          is_resident: boolean
          nationality: string | null
          payment_method: string | null
          phone: string | null
          position: string | null
          probation_end: string | null
          project_id: string | null
          region: number | null
          social_insurance_no: string | null
          start_date: string | null
          status: string
          tax_id: string | null
          tax_id_date: string | null
          tenant_id: string | null
          termination_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          base_salary?: number
          branch_id?: string | null
          citizen_id?: string | null
          citizen_id_date?: string | null
          citizen_id_place?: string | null
          code: string
          contract_no?: string | null
          contract_type?: string | null
          created_at?: string
          department?: string | null
          department_id?: string | null
          dependents?: number
          dob?: string | null
          email?: string | null
          end_date?: string | null
          ethnicity?: string | null
          full_name: string
          gender?: string | null
          health_insurance_no?: string | null
          hire_date?: string | null
          id?: string
          insurance_salary?: number
          is_resident?: boolean
          nationality?: string | null
          payment_method?: string | null
          phone?: string | null
          position?: string | null
          probation_end?: string | null
          project_id?: string | null
          region?: number | null
          social_insurance_no?: string | null
          start_date?: string | null
          status?: string
          tax_id?: string | null
          tax_id_date?: string | null
          tenant_id?: string | null
          termination_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          base_salary?: number
          branch_id?: string | null
          citizen_id?: string | null
          citizen_id_date?: string | null
          citizen_id_place?: string | null
          code?: string
          contract_no?: string | null
          contract_type?: string | null
          created_at?: string
          department?: string | null
          department_id?: string | null
          dependents?: number
          dob?: string | null
          email?: string | null
          end_date?: string | null
          ethnicity?: string | null
          full_name?: string
          gender?: string | null
          health_insurance_no?: string | null
          hire_date?: string | null
          id?: string
          insurance_salary?: number
          is_resident?: boolean
          nationality?: string | null
          payment_method?: string | null
          phone?: string | null
          position?: string | null
          probation_end?: string | null
          project_id?: string | null
          region?: number | null
          social_insurance_no?: string | null
          start_date?: string | null
          status?: string
          tax_id?: string | null
          tax_id_date?: string | null
          tenant_id?: string | null
          termination_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string
          currency: string
          id: string
          rate: number
          rate_date: string
          source: string | null
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          currency: string
          id?: string
          rate: number
          rate_date: string
          source?: string | null
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          rate?: number
          rate_date?: string
          source?: string | null
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      fa_asset_books: {
        Row: {
          accumulated_account: string
          asset_account: string
          asset_id: string
          book_id: string
          cost_basis: number | null
          created_at: string
          declining_factor: number
          expense_account: string
          id: string
          method: string
          notes: string | null
          opening_accumulated: number
          opening_months: number
          salvage_value: number
          start_date: string
          status: string
          suspend_from: string | null
          suspend_to: string | null
          tenant_id: string
          total_units: number | null
          updated_at: string
          useful_life_months: number
        }
        Insert: {
          accumulated_account?: string
          asset_account?: string
          asset_id: string
          book_id: string
          cost_basis?: number | null
          created_at?: string
          declining_factor?: number
          expense_account?: string
          id?: string
          method?: string
          notes?: string | null
          opening_accumulated?: number
          opening_months?: number
          salvage_value?: number
          start_date: string
          status?: string
          suspend_from?: string | null
          suspend_to?: string | null
          tenant_id: string
          total_units?: number | null
          updated_at?: string
          useful_life_months: number
        }
        Update: {
          accumulated_account?: string
          asset_account?: string
          asset_id?: string
          book_id?: string
          cost_basis?: number | null
          created_at?: string
          declining_factor?: number
          expense_account?: string
          id?: string
          method?: string
          notes?: string | null
          opening_accumulated?: number
          opening_months?: number
          salvage_value?: number
          start_date?: string
          status?: string
          suspend_from?: string | null
          suspend_to?: string | null
          tenant_id?: string
          total_units?: number | null
          updated_at?: string
          useful_life_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "fa_asset_books_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fa_asset_books_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "fa_depreciation_books"
            referencedColumns: ["id"]
          },
        ]
      }
      fa_categories: {
        Row: {
          asset_kind: string
          code: string
          created_at: string
          default_accumulated_account: string
          default_asset_account: string
          default_expense_account: string
          default_method: string
          default_useful_life_months: number | null
          default_useful_life_years_max: number | null
          default_useful_life_years_min: number | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          parent_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_kind?: string
          code: string
          created_at?: string
          default_accumulated_account?: string
          default_asset_account?: string
          default_expense_account?: string
          default_method?: string
          default_useful_life_months?: number | null
          default_useful_life_years_max?: number | null
          default_useful_life_years_min?: number | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          parent_id?: string | null
          tenant_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          asset_kind?: string
          code?: string
          created_at?: string
          default_accumulated_account?: string
          default_asset_account?: string
          default_expense_account?: string
          default_method?: string
          default_useful_life_months?: number | null
          default_useful_life_years_max?: number | null
          default_useful_life_years_min?: number | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          parent_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fa_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "fa_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      fa_depreciation_books: {
        Row: {
          code: string
          created_at: string
          currency: string
          id: string
          is_primary: boolean
          name: string
          notes: string | null
          post_to_gl: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          id?: string
          is_primary?: boolean
          name: string
          notes?: string | null
          post_to_gl?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string | null
          post_to_gl?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      fa_disposals: {
        Row: {
          accumulated_account: string | null
          accumulated_snapshot: number
          asset_account: string | null
          asset_id: string
          buyer_party_id: string | null
          cost_snapshot: number
          created_at: string
          created_by: string | null
          disposal_cost: number | null
          disposal_cost_account: string | null
          disposal_date: string
          disposal_type: string
          gain_loss: number
          id: string
          journal_entry_id: string | null
          notes: string | null
          other_expense_account: string | null
          other_income_account: string | null
          proceeds_account: string | null
          reason: string | null
          residual_value: number
          sale_amount: number | null
          sale_vat: number | null
          status: string
          tenant_id: string
          updated_at: string
          vat_output_account: string | null
          void_reason: string | null
        }
        Insert: {
          accumulated_account?: string | null
          accumulated_snapshot: number
          asset_account?: string | null
          asset_id: string
          buyer_party_id?: string | null
          cost_snapshot: number
          created_at?: string
          created_by?: string | null
          disposal_cost?: number | null
          disposal_cost_account?: string | null
          disposal_date: string
          disposal_type: string
          gain_loss: number
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          other_expense_account?: string | null
          other_income_account?: string | null
          proceeds_account?: string | null
          reason?: string | null
          residual_value: number
          sale_amount?: number | null
          sale_vat?: number | null
          status?: string
          tenant_id: string
          updated_at?: string
          vat_output_account?: string | null
          void_reason?: string | null
        }
        Update: {
          accumulated_account?: string | null
          accumulated_snapshot?: number
          asset_account?: string | null
          asset_id?: string
          buyer_party_id?: string | null
          cost_snapshot?: number
          created_at?: string
          created_by?: string | null
          disposal_cost?: number | null
          disposal_cost_account?: string | null
          disposal_date?: string
          disposal_type?: string
          gain_loss?: number
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          other_expense_account?: string | null
          other_income_account?: string | null
          proceeds_account?: string | null
          reason?: string | null
          residual_value?: number
          sale_amount?: number | null
          sale_vat?: number | null
          status?: string
          tenant_id?: string
          updated_at?: string
          vat_output_account?: string | null
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fa_disposals_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fa_disposals_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      fa_events: {
        Row: {
          amount: number | null
          asset_id: string
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string
          event_type: string
          id: string
          journal_entry_id: string | null
          payload: Json
          status: string
          tenant_id: string
          updated_at: string
          void_reason: string | null
        }
        Insert: {
          amount?: number | null
          asset_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          event_type: string
          id?: string
          journal_entry_id?: string | null
          payload?: Json
          status?: string
          tenant_id: string
          updated_at?: string
          void_reason?: string | null
        }
        Update: {
          amount?: number | null
          asset_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          event_type?: string
          id?: string
          journal_entry_id?: string | null
          payload?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fa_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fa_events_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      fa_inventory_count_lines: {
        Row: {
          asset_id: string | null
          count_id: string
          created_at: string
          expected_location: string | null
          found_location: string | null
          id: string
          notes: string | null
          scanned_at: string | null
          scanned_by: string | null
          scanned_code: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          asset_id?: string | null
          count_id: string
          created_at?: string
          expected_location?: string | null
          found_location?: string | null
          id?: string
          notes?: string | null
          scanned_at?: string | null
          scanned_by?: string | null
          scanned_code?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          asset_id?: string | null
          count_id?: string
          created_at?: string
          expected_location?: string | null
          found_location?: string | null
          id?: string
          notes?: string | null
          scanned_at?: string | null
          scanned_by?: string | null
          scanned_code?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fa_inventory_count_lines_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fa_inventory_count_lines_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "fa_inventory_counts"
            referencedColumns: ["id"]
          },
        ]
      }
      fa_inventory_counts: {
        Row: {
          branch_id: string | null
          code: string
          count_date: string
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          id: string
          location: string | null
          posted_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          code: string
          count_date: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          location?: string | null
          posted_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          code?: string
          count_date?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          location?: string | null
          posted_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      fa_reclassifications: {
        Row: {
          accumulated_account: string | null
          accumulated_snapshot: number
          allocation_months: number | null
          asset_account: string | null
          asset_id: string
          cost_snapshot: number
          created_at: string
          created_by: string | null
          direction: string
          expense_account: string | null
          id: string
          journal_entry_id: string | null
          reason: string | null
          reclass_date: string
          residual_value: number
          status: string
          target_account: string
          tenant_id: string
          updated_at: string
          void_reason: string | null
        }
        Insert: {
          accumulated_account?: string | null
          accumulated_snapshot: number
          allocation_months?: number | null
          asset_account?: string | null
          asset_id: string
          cost_snapshot: number
          created_at?: string
          created_by?: string | null
          direction: string
          expense_account?: string | null
          id?: string
          journal_entry_id?: string | null
          reason?: string | null
          reclass_date: string
          residual_value: number
          status?: string
          target_account: string
          tenant_id: string
          updated_at?: string
          void_reason?: string | null
        }
        Update: {
          accumulated_account?: string | null
          accumulated_snapshot?: number
          allocation_months?: number | null
          asset_account?: string | null
          asset_id?: string
          cost_snapshot?: number
          created_at?: string
          created_by?: string | null
          direction?: string
          expense_account?: string | null
          id?: string
          journal_entry_id?: string | null
          reason?: string | null
          reclass_date?: string
          residual_value?: number
          status?: string
          target_account?: string
          tenant_id?: string
          updated_at?: string
          void_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fa_reclassifications_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fa_reclassifications_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          end_date: string
          fiscal_year_id: string
          id: string
          note: string | null
          period_no: number
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date: string
          fiscal_year_id: string
          id?: string
          note?: string | null
          period_no: number
          start_date: string
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string
          fiscal_year_id?: string
          id?: string
          note?: string | null
          period_no?: number
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_periods_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_years: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          end_date: string
          id: string
          note: string | null
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date: string
          id?: string
          note?: string | null
          start_date: string
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string
          id?: string
          note?: string | null
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      fixed_assets: {
        Row: {
          accumulated_account: string
          acquired_date: string | null
          asset_account: string
          asset_kind: string
          assignee_id: string | null
          attachments: Json
          barcode: string | null
          branch_id: string | null
          category_id: string | null
          code: string
          cost: number
          cost_center_id: string | null
          created_at: string
          department_id: string | null
          expense_account: string
          funding_source: string | null
          id: string
          image_url: string | null
          in_service_date: string | null
          location: string | null
          manufacturer: string | null
          method: string
          mfg_year: number | null
          model: string | null
          name: string
          notes: string | null
          opening_accumulated: number
          opening_months: number
          origin_country: string | null
          project_id: string | null
          quantity: number
          salvage_value: number
          serial_no: string | null
          source_doc_id: string | null
          source_doc_table: string | null
          source_type: string
          start_date: string
          status: string
          supplier_id: string | null
          tenant_id: string | null
          unit: string | null
          updated_at: string
          useful_life_months: number
          user_id: string
        }
        Insert: {
          accumulated_account?: string
          acquired_date?: string | null
          asset_account?: string
          asset_kind?: string
          assignee_id?: string | null
          attachments?: Json
          barcode?: string | null
          branch_id?: string | null
          category_id?: string | null
          code: string
          cost: number
          cost_center_id?: string | null
          created_at?: string
          department_id?: string | null
          expense_account?: string
          funding_source?: string | null
          id?: string
          image_url?: string | null
          in_service_date?: string | null
          location?: string | null
          manufacturer?: string | null
          method?: string
          mfg_year?: number | null
          model?: string | null
          name: string
          notes?: string | null
          opening_accumulated?: number
          opening_months?: number
          origin_country?: string | null
          project_id?: string | null
          quantity?: number
          salvage_value?: number
          serial_no?: string | null
          source_doc_id?: string | null
          source_doc_table?: string | null
          source_type?: string
          start_date: string
          status?: string
          supplier_id?: string | null
          tenant_id?: string | null
          unit?: string | null
          updated_at?: string
          useful_life_months: number
          user_id: string
        }
        Update: {
          accumulated_account?: string
          acquired_date?: string | null
          asset_account?: string
          asset_kind?: string
          assignee_id?: string | null
          attachments?: Json
          barcode?: string | null
          branch_id?: string | null
          category_id?: string | null
          code?: string
          cost?: number
          cost_center_id?: string | null
          created_at?: string
          department_id?: string | null
          expense_account?: string
          funding_source?: string | null
          id?: string
          image_url?: string | null
          in_service_date?: string | null
          location?: string | null
          manufacturer?: string | null
          method?: string
          mfg_year?: number | null
          model?: string | null
          name?: string
          notes?: string | null
          opening_accumulated?: number
          opening_months?: number
          origin_country?: string | null
          project_id?: string | null
          quantity?: number
          salvage_value?: number
          serial_no?: string | null
          source_doc_id?: string | null
          source_doc_table?: string | null
          source_type?: string
          start_date?: string
          status?: string
          supplier_id?: string | null
          tenant_id?: string | null
          unit?: string | null
          updated_at?: string
          useful_life_months?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "fa_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          classification: Json
          created_at: string
          decisions: Json | null
          id: string
          kind: string
          status: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          classification?: Json
          created_at?: string
          decisions?: Json | null
          id?: string
          kind: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          classification?: Json
          created_at?: string
          decisions?: Json | null
          id?: string
          kind?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      inbox_decisions: {
        Row: {
          action: string
          confidence_at_decision: number | null
          decided_at: string
          final_entry: Json | null
          id: string
          item_external_id: string
          item_source: string
          journal_entry_id: string | null
          note: string | null
          original_entry: Json | null
          rule_id: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          action: string
          confidence_at_decision?: number | null
          decided_at?: string
          final_entry?: Json | null
          id?: string
          item_external_id: string
          item_source: string
          journal_entry_id?: string | null
          note?: string | null
          original_entry?: Json | null
          rule_id?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          action?: string
          confidence_at_decision?: number | null
          decided_at?: string
          final_entry?: Json | null
          id?: string
          item_external_id?: string
          item_source?: string
          journal_entry_id?: string | null
          note?: string | null
          original_entry?: Json | null
          rule_id?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbox_decisions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "inbox_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_rules: {
        Row: {
          apply_account: string | null
          apply_dimension: Json
          confidence_boost: number
          created_at: string
          disabled_at: string | null
          enabled: boolean
          hit_count: number
          id: string
          last_hit_at: string | null
          note: string | null
          pattern_kind: string
          pattern_value: string
          source: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          apply_account?: string | null
          apply_dimension?: Json
          confidence_boost?: number
          created_at?: string
          disabled_at?: string | null
          enabled?: boolean
          hit_count?: number
          id?: string
          last_hit_at?: string | null
          note?: string | null
          pattern_kind: string
          pattern_value: string
          source?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          apply_account?: string | null
          apply_dimension?: Json
          confidence_boost?: number
          created_at?: string
          disabled_at?: string | null
          enabled?: boolean
          hit_count?: number
          id?: string
          last_hit_at?: string | null
          note?: string | null
          pattern_kind?: string
          pattern_value?: string
          source?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          amount: number | null
          description: string | null
          id: string
          invoice_id: string
          line_type: string
          product_id: string | null
          qty: number | null
          resolution_confidence: number | null
          resolution_source: string | null
          resolved_account: string | null
          resolved_kind: string | null
          unit_price: number | null
          user_override_kind: string | null
          vat_rate: number | null
        }
        Insert: {
          amount?: number | null
          description?: string | null
          id?: string
          invoice_id: string
          line_type?: string
          product_id?: string | null
          qty?: number | null
          resolution_confidence?: number | null
          resolution_source?: string | null
          resolved_account?: string | null
          resolved_kind?: string | null
          unit_price?: number | null
          user_override_kind?: string | null
          vat_rate?: number | null
        }
        Update: {
          amount?: number | null
          description?: string | null
          id?: string
          invoice_id?: string
          line_type?: string
          product_id?: string | null
          qty?: number | null
          resolution_confidence?: number | null
          resolution_source?: string | null
          resolved_account?: string | null
          resolved_kind?: string | null
          unit_price?: number | null
          user_override_kind?: string | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          branch_id: string | null
          cost_center_id: string | null
          created_at: string
          currency: string | null
          department_id: string | null
          expense_account: string | null
          file_hash: string | null
          file_path: string
          id: string
          invoice_no: string | null
          issue_date: string | null
          notes: string | null
          payment_status: string
          posted_at: string | null
          project_id: string | null
          raw_ocr: Json | null
          status: string
          subtotal: number | null
          supplier_id: string | null
          supplier_name: string | null
          supplier_tax_id: string | null
          tenant_id: string | null
          total: number | null
          updated_at: string
          user_id: string
          vat_amount: number | null
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          branch_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string | null
          department_id?: string | null
          expense_account?: string | null
          file_hash?: string | null
          file_path: string
          id?: string
          invoice_no?: string | null
          issue_date?: string | null
          notes?: string | null
          payment_status?: string
          posted_at?: string | null
          project_id?: string | null
          raw_ocr?: Json | null
          status?: string
          subtotal?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_tax_id?: string | null
          tenant_id?: string | null
          total?: number | null
          updated_at?: string
          user_id: string
          vat_amount?: number | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          branch_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string | null
          department_id?: string | null
          expense_account?: string | null
          file_hash?: string | null
          file_path?: string
          id?: string
          invoice_no?: string | null
          issue_date?: string | null
          notes?: string | null
          payment_status?: string
          posted_at?: string | null
          project_id?: string | null
          raw_ocr?: Json | null
          status?: string
          subtotal?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_tax_id?: string | null
          tenant_id?: string | null
          total?: number | null
          updated_at?: string
          user_id?: string
          vat_amount?: number | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_allowlist: {
        Row: {
          cidr: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          scope: string
          tenant_id: string | null
        }
        Insert: {
          cidr: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          scope: string
          tenant_id?: string | null
        }
        Update: {
          cidr?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          scope?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ip_allowlist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      item_resolution_log: {
        Row: {
          corrected_kind: string | null
          corrected_product_id: string | null
          created_at: string
          feedback_reason: string | null
          id: string
          invoice_line_id: string | null
          method: string
          price: number | null
          qty: number | null
          raw_name: string
          raw_unit: string | null
          resolved_product_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          score: number | null
          signals: Json
          supplier_id: string | null
          tenant_id: string
          verdict: string | null
        }
        Insert: {
          corrected_kind?: string | null
          corrected_product_id?: string | null
          created_at?: string
          feedback_reason?: string | null
          id?: string
          invoice_line_id?: string | null
          method: string
          price?: number | null
          qty?: number | null
          raw_name: string
          raw_unit?: string | null
          resolved_product_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          signals?: Json
          supplier_id?: string | null
          tenant_id: string
          verdict?: string | null
        }
        Update: {
          corrected_kind?: string | null
          corrected_product_id?: string | null
          created_at?: string
          feedback_reason?: string | null
          id?: string
          invoice_line_id?: string | null
          method?: string
          price?: number | null
          qty?: number | null
          raw_name?: string
          raw_unit?: string | null
          resolved_product_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number | null
          signals?: Json
          supplier_id?: string | null
          tenant_id?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_resolution_log_corrected_product_id_fkey"
            columns: ["corrected_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_resolution_log_resolved_product_id_fkey"
            columns: ["resolved_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_resolution_log_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_resolution_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          branch_id: string | null
          cost_center_id: string | null
          created_at: string
          description: string | null
          entry_date: string
          id: string
          invoice_id: string | null
          project_id: string | null
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          invoice_id?: string | null
          project_id?: string | null
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          branch_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          invoice_id?: string | null
          project_id?: string | null
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_code: string
          branch_id: string | null
          cost_center_id: string | null
          credit: number
          debit: number
          department_id: string | null
          entry_id: string
          id: string
          line_order: number
          project_id: string | null
        }
        Insert: {
          account_code: string
          branch_id?: string | null
          cost_center_id?: string | null
          credit?: number
          debit?: number
          department_id?: string | null
          entry_id: string
          id?: string
          line_order?: number
          project_id?: string | null
        }
        Update: {
          account_code?: string
          branch_id?: string | null
          cost_center_id?: string | null
          credit?: number
          debit?: number
          department_id?: string | null
          entry_id?: string
          id?: string
          line_order?: number
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "journal_lines_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      master_catalogs: {
        Row: {
          current_version: number
          description: string | null
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          current_version?: number
          description?: string | null
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          current_version?: number
          description?: string | null
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      monthly_summary: {
        Row: {
          collected: number
          paid: number
          purchase_count: number
          purchase_expense: number
          sales_count: number
          sales_revenue: number
          tenant_id: string
          updated_at: string
          year_month: string
        }
        Insert: {
          collected?: number
          paid?: number
          purchase_count?: number
          purchase_expense?: number
          sales_count?: number
          sales_revenue?: number
          tenant_id: string
          updated_at?: string
          year_month: string
        }
        Update: {
          collected?: number
          paid?: number
          purchase_count?: number
          purchase_expense?: number
          sales_count?: number
          sales_revenue?: number
          tenant_id?: string
          updated_at?: string
          year_month?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          href: string | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      office_client_links: {
        Row: {
          account_manager_id: string | null
          agency_tenant_id: string
          client_tenant_id: string
          created_at: string
          created_by: string | null
          display_name: string | null
          fee_per_month: number | null
          id: string
          notes: string | null
          service_end_date: string | null
          service_start_date: string | null
          status: Database["public"]["Enums"]["office_link_status"]
          updated_at: string
        }
        Insert: {
          account_manager_id?: string | null
          agency_tenant_id: string
          client_tenant_id: string
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          fee_per_month?: number | null
          id?: string
          notes?: string | null
          service_end_date?: string | null
          service_start_date?: string | null
          status?: Database["public"]["Enums"]["office_link_status"]
          updated_at?: string
        }
        Update: {
          account_manager_id?: string | null
          agency_tenant_id?: string
          client_tenant_id?: string
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          fee_per_month?: number | null
          id?: string
          notes?: string | null
          service_end_date?: string | null
          service_start_date?: string | null
          status?: Database["public"]["Enums"]["office_link_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_client_links_account_manager_id_fkey"
            columns: ["account_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_client_links_agency_tenant_id_fkey"
            columns: ["agency_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_client_links_client_tenant_id_fkey"
            columns: ["client_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_client_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      office_contract_renewals: {
        Row: {
          contract_id: string
          created_by: string | null
          id: string
          new_end_date: string | null
          new_fee_amount: number | null
          notes: string | null
          prev_end_date: string | null
          renewed_at: string
        }
        Insert: {
          contract_id: string
          created_by?: string | null
          id?: string
          new_end_date?: string | null
          new_fee_amount?: number | null
          notes?: string | null
          prev_end_date?: string | null
          renewed_at?: string
        }
        Update: {
          contract_id?: string
          created_by?: string | null
          id?: string
          new_end_date?: string | null
          new_fee_amount?: number | null
          notes?: string | null
          prev_end_date?: string | null
          renewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_contract_renewals_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "office_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_contract_renewals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      office_contracts: {
        Row: {
          agency_tenant_id: string
          billing_cycle: Database["public"]["Enums"]["office_billing_cycle"]
          contract_no: string
          created_at: string
          created_by: string | null
          end_date: string | null
          fee_amount: number | null
          file_url: string | null
          id: string
          link_id: string
          notes: string | null
          services: Json
          sign_date: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["office_contract_status"]
          updated_at: string
        }
        Insert: {
          agency_tenant_id: string
          billing_cycle?: Database["public"]["Enums"]["office_billing_cycle"]
          contract_no: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          fee_amount?: number | null
          file_url?: string | null
          id?: string
          link_id: string
          notes?: string | null
          services?: Json
          sign_date?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["office_contract_status"]
          updated_at?: string
        }
        Update: {
          agency_tenant_id?: string
          billing_cycle?: Database["public"]["Enums"]["office_billing_cycle"]
          contract_no?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          fee_amount?: number | null
          file_url?: string | null
          id?: string
          link_id?: string
          notes?: string | null
          services?: Json
          sign_date?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["office_contract_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_contracts_agency_tenant_id_fkey"
            columns: ["agency_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_contracts_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "office_client_links"
            referencedColumns: ["id"]
          },
        ]
      }
      office_prospects: {
        Row: {
          account_manager_id: string | null
          address: string | null
          agency_tenant_id: string
          code: string | null
          contact_person: string | null
          converted_tenant_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          estimated_fee: number | null
          id: string
          industry: string | null
          name: string
          notes: string | null
          phone: string | null
          source: string | null
          status: Database["public"]["Enums"]["office_prospect_status"]
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          account_manager_id?: string | null
          address?: string | null
          agency_tenant_id: string
          code?: string | null
          contact_person?: string | null
          converted_tenant_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          estimated_fee?: number | null
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["office_prospect_status"]
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          account_manager_id?: string | null
          address?: string | null
          agency_tenant_id?: string
          code?: string | null
          contact_person?: string | null
          converted_tenant_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          estimated_fee?: number | null
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["office_prospect_status"]
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_prospects_account_manager_id_fkey"
            columns: ["account_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_prospects_agency_tenant_id_fkey"
            columns: ["agency_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_prospects_converted_tenant_id_fkey"
            columns: ["converted_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_prospects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      office_staff: {
        Row: {
          agency_tenant_id: string
          avatar_url: string | null
          created_at: string
          department: string | null
          email: string | null
          employee_code: string | null
          full_name: string
          id: string
          join_date: string | null
          leave_date: string | null
          notes: string | null
          phone: string | null
          position: string | null
          skills: string[] | null
          status: Database["public"]["Enums"]["office_staff_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agency_tenant_id: string
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          employee_code?: string | null
          full_name: string
          id?: string
          join_date?: string | null
          leave_date?: string | null
          notes?: string | null
          phone?: string | null
          position?: string | null
          skills?: string[] | null
          status?: Database["public"]["Enums"]["office_staff_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agency_tenant_id?: string
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          employee_code?: string | null
          full_name?: string
          id?: string
          join_date?: string | null
          leave_date?: string | null
          notes?: string | null
          phone?: string | null
          position?: string | null
          skills?: string[] | null
          status?: Database["public"]["Enums"]["office_staff_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "office_staff_agency_tenant_id_fkey"
            columns: ["agency_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_staff_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      office_staff_assignments: {
        Row: {
          created_at: string
          from_date: string | null
          id: string
          link_id: string
          role: string
          staff_id: string
          to_date: string | null
        }
        Insert: {
          created_at?: string
          from_date?: string | null
          id?: string
          link_id: string
          role?: string
          staff_id: string
          to_date?: string | null
        }
        Update: {
          created_at?: string
          from_date?: string | null
          id?: string
          link_id?: string
          role?: string
          staff_id?: string
          to_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "office_staff_assignments_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "office_client_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_staff_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "office_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      office_task_attachments: {
        Row: {
          created_at: string
          file_name: string | null
          file_url: string
          id: string
          task_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_url: string
          id?: string
          task_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_url?: string
          id?: string
          task_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "office_task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "office_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_task_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      office_task_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "office_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      office_task_templates: {
        Row: {
          active: boolean
          agency_tenant_id: string
          category: Database["public"]["Enums"]["office_task_category"]
          checklist: Json
          created_at: string
          default_assignee_id: string | null
          id: string
          lead_days: number
          rule_day: number | null
          rule_month: number | null
          rule_type: string
          scope: string
          scope_link_ids: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          agency_tenant_id: string
          category?: Database["public"]["Enums"]["office_task_category"]
          checklist?: Json
          created_at?: string
          default_assignee_id?: string | null
          id?: string
          lead_days?: number
          rule_day?: number | null
          rule_month?: number | null
          rule_type?: string
          scope?: string
          scope_link_ids?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          agency_tenant_id?: string
          category?: Database["public"]["Enums"]["office_task_category"]
          checklist?: Json
          created_at?: string
          default_assignee_id?: string | null
          id?: string
          lead_days?: number
          rule_day?: number | null
          rule_month?: number | null
          rule_type?: string
          scope?: string
          scope_link_ids?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_task_templates_agency_tenant_id_fkey"
            columns: ["agency_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_task_templates_default_assignee_id_fkey"
            columns: ["default_assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      office_tasks: {
        Row: {
          agency_tenant_id: string
          assignee_user_id: string | null
          category: Database["public"]["Enums"]["office_task_category"]
          checklist: Json
          completed_at: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          link_id: string | null
          period_month: number | null
          period_year: number | null
          position: number
          priority: Database["public"]["Enums"]["office_task_priority"]
          recurring_template_id: string | null
          reviewer_user_id: string | null
          status: Database["public"]["Enums"]["office_task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          agency_tenant_id: string
          assignee_user_id?: string | null
          category?: Database["public"]["Enums"]["office_task_category"]
          checklist?: Json
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          link_id?: string | null
          period_month?: number | null
          period_year?: number | null
          position?: number
          priority?: Database["public"]["Enums"]["office_task_priority"]
          recurring_template_id?: string | null
          reviewer_user_id?: string | null
          status?: Database["public"]["Enums"]["office_task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          agency_tenant_id?: string
          assignee_user_id?: string | null
          category?: Database["public"]["Enums"]["office_task_category"]
          checklist?: Json
          completed_at?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          link_id?: string | null
          period_month?: number | null
          period_year?: number | null
          position?: number
          priority?: Database["public"]["Enums"]["office_task_priority"]
          recurring_template_id?: string | null
          reviewer_user_id?: string | null
          status?: Database["public"]["Enums"]["office_task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_tasks_agency_tenant_id_fkey"
            columns: ["agency_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_tasks_assignee_user_id_fkey"
            columns: ["assignee_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_tasks_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "office_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_tasks_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "office_client_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_tasks_recurring_template_id_fkey"
            columns: ["recurring_template_id"]
            isOneToOne: false
            referencedRelation: "office_task_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_tasks_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_advances: {
        Row: {
          amount: number
          created_at: string
          employee_id: string
          id: string
          period_month: string
          reason: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          employee_id: string
          id?: string
          period_month: string
          reason?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          employee_id?: string
          id?: string
          period_month?: string
          reason?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_lines: {
        Row: {
          advance: number
          allowance: number
          base_salary: number
          bhtn_co: number
          bhtn_emp: number
          bhxh_co: number
          bhxh_emp: number
          bhyt_co: number
          bhyt_emp: number
          dependents: number
          employee_id: string
          gross: number
          id: string
          net: number
          pit: number
          run_id: string
          taxable: number
        }
        Insert: {
          advance?: number
          allowance?: number
          base_salary?: number
          bhtn_co?: number
          bhtn_emp?: number
          bhxh_co?: number
          bhxh_emp?: number
          bhyt_co?: number
          bhyt_emp?: number
          dependents?: number
          employee_id: string
          gross?: number
          id?: string
          net?: number
          pit?: number
          run_id: string
          taxable?: number
        }
        Update: {
          advance?: number
          allowance?: number
          base_salary?: number
          bhtn_co?: number
          bhtn_emp?: number
          bhxh_co?: number
          bhxh_emp?: number
          bhyt_co?: number
          bhyt_emp?: number
          dependents?: number
          employee_id?: string
          gross?: number
          id?: string
          net?: number
          pit?: number
          run_id?: string
          taxable?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_lines_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_policies: {
        Row: {
          bh_cap_salary: number
          bhtn_co_rate: number
          bhtn_emp_rate: number
          bhxh_co_rate: number
          bhxh_emp_rate: number
          bhyt_co_rate: number
          bhyt_emp_rate: number
          created_at: string
          dependent_deduction: number
          id: string
          notes: string | null
          personal_deduction: number
          tenant_id: string
          unemployment_cap_region1: number
          union_co_rate: number
          updated_at: string
          year: number
        }
        Insert: {
          bh_cap_salary?: number
          bhtn_co_rate?: number
          bhtn_emp_rate?: number
          bhxh_co_rate?: number
          bhxh_emp_rate?: number
          bhyt_co_rate?: number
          bhyt_emp_rate?: number
          created_at?: string
          dependent_deduction?: number
          id?: string
          notes?: string | null
          personal_deduction?: number
          tenant_id: string
          unemployment_cap_region1?: number
          union_co_rate?: number
          updated_at?: string
          year: number
        }
        Update: {
          bh_cap_salary?: number
          bhtn_co_rate?: number
          bhtn_emp_rate?: number
          bhxh_co_rate?: number
          bhxh_emp_rate?: number
          bhyt_co_rate?: number
          bhyt_emp_rate?: number
          created_at?: string
          dependent_deduction?: number
          id?: string
          notes?: string | null
          personal_deduction?: number
          tenant_id?: string
          unemployment_cap_region1?: number
          union_co_rate?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      payroll_run_lines: {
        Row: {
          amount: number
          component_code: string | null
          component_id: string | null
          component_name: string | null
          created_at: string
          employee_id: string
          id: string
          insurable_amount: number
          kind: string | null
          run_id: string
          taxable_amount: number
          tenant_id: string
        }
        Insert: {
          amount?: number
          component_code?: string | null
          component_id?: string | null
          component_name?: string | null
          created_at?: string
          employee_id: string
          id?: string
          insurable_amount?: number
          kind?: string | null
          run_id: string
          taxable_amount?: number
          tenant_id: string
        }
        Update: {
          amount?: number
          component_code?: string | null
          component_id?: string | null
          component_name?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          insurable_amount?: number
          kind?: string | null
          run_id?: string
          taxable_amount?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_run_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "salary_components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_run_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_run_lines_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_run_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          branch_id: string | null
          created_at: string
          department_id: string | null
          id: string
          journal_entry_id: string | null
          paid_at: string | null
          paid_reference: string | null
          payment_status: string
          period_month: string
          status: string
          tenant_id: string | null
          total_gross: number
          total_insurance_co: number
          total_insurance_emp: number
          total_net: number
          total_pit: number
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          journal_entry_id?: string | null
          paid_at?: string | null
          paid_reference?: string | null
          payment_status?: string
          period_month: string
          status?: string
          tenant_id?: string | null
          total_gross?: number
          total_insurance_co?: number
          total_insurance_emp?: number
          total_net?: number
          total_pit?: number
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          journal_entry_id?: string | null
          paid_at?: string | null
          paid_reference?: string | null
          payment_status?: string
          period_month?: string
          status?: string
          tenant_id?: string | null
          total_gross?: number
          total_insurance_co?: number
          total_insurance_emp?: number
          total_net?: number
          total_pit?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_embeddings: {
        Row: {
          embedding: string
          model: string
          product_id: string
          source_text: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          embedding: string
          model?: string
          product_id: string
          source_text: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          embedding?: string
          model?: string
          product_id?: string
          source_text?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_embeddings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_unit_conversions: {
        Row: {
          created_at: string
          factor: number
          id: string
          is_default_purchase: boolean
          is_default_sale: boolean
          note: string | null
          product_id: string
          tenant_id: string | null
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          factor: number
          id?: string
          is_default_purchase?: boolean
          is_default_sale?: boolean
          note?: string | null
          product_id: string
          tenant_id?: string | null
          unit: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          factor?: number
          id?: string
          is_default_purchase?: boolean
          is_default_sale?: boolean
          note?: string | null
          product_id?: string
          tenant_id?: string | null
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_unit_conversions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_units: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          note: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          aliases: string[]
          asset_account: string | null
          barcode: string | null
          can_be_purchased: boolean
          can_be_sold: boolean
          category_id: string | null
          code: string
          cogs_account: string
          created_at: string
          expense_account: string | null
          id: string
          inventory_account: string | null
          is_active: boolean
          item_type: string
          max_stock: number
          min_stock: number
          name: string
          notes: string | null
          on_hand: number
          prepaid_account: string | null
          revenue_account: string
          stock_account: string
          tenant_id: string | null
          unit: string
          unit_cost: number
          unit_price: number
          user_id: string
          vat_rate: number
        }
        Insert: {
          aliases?: string[]
          asset_account?: string | null
          barcode?: string | null
          can_be_purchased?: boolean
          can_be_sold?: boolean
          category_id?: string | null
          code: string
          cogs_account?: string
          created_at?: string
          expense_account?: string | null
          id?: string
          inventory_account?: string | null
          is_active?: boolean
          item_type?: string
          max_stock?: number
          min_stock?: number
          name: string
          notes?: string | null
          on_hand?: number
          prepaid_account?: string | null
          revenue_account?: string
          stock_account?: string
          tenant_id?: string | null
          unit?: string
          unit_cost?: number
          unit_price?: number
          user_id: string
          vat_rate?: number
        }
        Update: {
          aliases?: string[]
          asset_account?: string | null
          barcode?: string | null
          can_be_purchased?: boolean
          can_be_sold?: boolean
          category_id?: string | null
          code?: string
          cogs_account?: string
          created_at?: string
          expense_account?: string | null
          id?: string
          inventory_account?: string | null
          is_active?: boolean
          item_type?: string
          max_stock?: number
          min_stock?: number
          name?: string
          notes?: string | null
          on_hand?: number
          prepaid_account?: string | null
          revenue_account?: string
          stock_account?: string
          tenant_id?: string | null
          unit?: string
          unit_cost?: number
          unit_price?: number
          user_id?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accounting_standard: string
          active_tenant_id: string | null
          address: string | null
          avatar_url: string | null
          bank_account: string | null
          base_currency: string
          chief_accountant_name: string | null
          company_name: string | null
          created_at: string
          date_format: string
          default_branch_id: string | null
          default_department_id: string | null
          default_project_id: string | null
          display_name: string | null
          email: string | null
          fiscal_year_start: number
          id: string
          job_title: string | null
          language: string
          legal_rep_name: string | null
          logo_url: string | null
          number_format: string
          phone: string | null
          preparer_name: string | null
          signature_url: string | null
          signer_name: string | null
          stamp_url: string | null
          tax_id: string | null
          timezone: string
        }
        Insert: {
          accounting_standard?: string
          active_tenant_id?: string | null
          address?: string | null
          avatar_url?: string | null
          bank_account?: string | null
          base_currency?: string
          chief_accountant_name?: string | null
          company_name?: string | null
          created_at?: string
          date_format?: string
          default_branch_id?: string | null
          default_department_id?: string | null
          default_project_id?: string | null
          display_name?: string | null
          email?: string | null
          fiscal_year_start?: number
          id: string
          job_title?: string | null
          language?: string
          legal_rep_name?: string | null
          logo_url?: string | null
          number_format?: string
          phone?: string | null
          preparer_name?: string | null
          signature_url?: string | null
          signer_name?: string | null
          stamp_url?: string | null
          tax_id?: string | null
          timezone?: string
        }
        Update: {
          accounting_standard?: string
          active_tenant_id?: string | null
          address?: string | null
          avatar_url?: string | null
          bank_account?: string | null
          base_currency?: string
          chief_accountant_name?: string | null
          company_name?: string | null
          created_at?: string
          date_format?: string
          default_branch_id?: string | null
          default_department_id?: string | null
          default_project_id?: string | null
          display_name?: string | null
          email?: string | null
          fiscal_year_start?: number
          id?: string
          job_title?: string | null
          language?: string
          legal_rep_name?: string | null
          logo_url?: string | null
          number_format?: string
          phone?: string | null
          preparer_name?: string | null
          signature_url?: string | null
          signer_name?: string | null
          stamp_url?: string | null
          tax_id?: string | null
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_branch_id_fkey"
            columns: ["default_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_default_department_id_fkey"
            columns: ["default_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_default_project_id_fkey"
            columns: ["default_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          code: string
          created_at: string
          customer_id: string | null
          description: string | null
          end_date: string | null
          id: string
          is_active: boolean
          manager_employee_id: string | null
          name: string
          start_date: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          customer_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          manager_employee_id?: string | null
          name: string
          start_date?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          customer_id?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          manager_employee_id?: string | null
          name?: string
          start_date?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_manager_employee_id_fkey"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_voucher_lines: {
        Row: {
          amount: number
          created_at: string
          debit_account: string | null
          description: string | null
          discount_amount: number
          discount_pct: number
          id: string
          invoice_id: string | null
          invoice_no: string | null
          line_order: number
          line_type: string
          note: string | null
          product_code: string | null
          product_id: string | null
          product_name: string | null
          qty: number
          total: number
          unit: string | null
          unit_price: number
          vat_account: string | null
          vat_amount: number
          vat_rate: number
          voucher_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          debit_account?: string | null
          description?: string | null
          discount_amount?: number
          discount_pct?: number
          id?: string
          invoice_id?: string | null
          invoice_no?: string | null
          line_order?: number
          line_type?: string
          note?: string | null
          product_code?: string | null
          product_id?: string | null
          product_name?: string | null
          qty?: number
          total?: number
          unit?: string | null
          unit_price?: number
          vat_account?: string | null
          vat_amount?: number
          vat_rate?: number
          voucher_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          debit_account?: string | null
          description?: string | null
          discount_amount?: number
          discount_pct?: number
          id?: string
          invoice_id?: string | null
          invoice_no?: string | null
          line_order?: number
          line_type?: string
          note?: string | null
          product_code?: string | null
          product_id?: string | null
          product_name?: string | null
          qty?: number
          total?: number
          unit?: string | null
          unit_price?: number
          vat_account?: string | null
          vat_amount?: number
          vat_rate?: number
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_voucher_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_voucher_lines_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "purchase_vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_vouchers: {
        Row: {
          auto_allocate_cost: boolean
          bank_voucher_id: string | null
          branch_id: string | null
          cash_voucher_id: string | null
          cost_center_id: string | null
          create_stock_voucher: boolean
          created_at: string
          credit_account: string
          currency: string | null
          customer_group: string | null
          debit_account: string
          department_id: string | null
          discount_amount: number
          discount_pct: number
          due_date: string | null
          exchange_rate: number
          id: string
          invoice_date: string | null
          invoice_id: string | null
          invoice_no: string | null
          invoice_receipt_type: string
          is_non_deductible: boolean
          is_purchase_cost: boolean
          journal_entry_id: string | null
          notes: string | null
          paid_amount: number
          pay_now: boolean
          payment_account: string | null
          payment_method: string
          payment_status: string
          posted_at: string | null
          project_id: string | null
          reason: string | null
          status: string
          stock_voucher_date: string | null
          stock_voucher_id: string | null
          stock_voucher_no: string | null
          stock_voucher_reason: string | null
          subtotal: number
          supplier_address: string | null
          supplier_id: string | null
          supplier_name: string | null
          supplier_tax_id: string | null
          tenant_id: string | null
          total: number
          updated_at: string
          user_id: string
          vat_account: string | null
          vat_amount: number
          vat_rate: number
          void_reason: string | null
          voided_at: string | null
          voucher_date: string
          voucher_no: string
          warehouse_id: string | null
        }
        Insert: {
          auto_allocate_cost?: boolean
          bank_voucher_id?: string | null
          branch_id?: string | null
          cash_voucher_id?: string | null
          cost_center_id?: string | null
          create_stock_voucher?: boolean
          created_at?: string
          credit_account?: string
          currency?: string | null
          customer_group?: string | null
          debit_account?: string
          department_id?: string | null
          discount_amount?: number
          discount_pct?: number
          due_date?: string | null
          exchange_rate?: number
          id?: string
          invoice_date?: string | null
          invoice_id?: string | null
          invoice_no?: string | null
          invoice_receipt_type?: string
          is_non_deductible?: boolean
          is_purchase_cost?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          paid_amount?: number
          pay_now?: boolean
          payment_account?: string | null
          payment_method?: string
          payment_status?: string
          posted_at?: string | null
          project_id?: string | null
          reason?: string | null
          status?: string
          stock_voucher_date?: string | null
          stock_voucher_id?: string | null
          stock_voucher_no?: string | null
          stock_voucher_reason?: string | null
          subtotal?: number
          supplier_address?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_tax_id?: string | null
          tenant_id?: string | null
          total?: number
          updated_at?: string
          user_id: string
          vat_account?: string | null
          vat_amount?: number
          vat_rate?: number
          void_reason?: string | null
          voided_at?: string | null
          voucher_date?: string
          voucher_no: string
          warehouse_id?: string | null
        }
        Update: {
          auto_allocate_cost?: boolean
          bank_voucher_id?: string | null
          branch_id?: string | null
          cash_voucher_id?: string | null
          cost_center_id?: string | null
          create_stock_voucher?: boolean
          created_at?: string
          credit_account?: string
          currency?: string | null
          customer_group?: string | null
          debit_account?: string
          department_id?: string | null
          discount_amount?: number
          discount_pct?: number
          due_date?: string | null
          exchange_rate?: number
          id?: string
          invoice_date?: string | null
          invoice_id?: string | null
          invoice_no?: string | null
          invoice_receipt_type?: string
          is_non_deductible?: boolean
          is_purchase_cost?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          paid_amount?: number
          pay_now?: boolean
          payment_account?: string | null
          payment_method?: string
          payment_status?: string
          posted_at?: string | null
          project_id?: string | null
          reason?: string | null
          status?: string
          stock_voucher_date?: string | null
          stock_voucher_id?: string | null
          stock_voucher_no?: string | null
          stock_voucher_reason?: string | null
          subtotal?: number
          supplier_address?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_tax_id?: string | null
          tenant_id?: string | null
          total?: number
          updated_at?: string
          user_id?: string
          vat_account?: string | null
          vat_amount?: number
          vat_rate?: number
          void_reason?: string | null
          voided_at?: string | null
          voucher_date?: string
          voucher_no?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_vouchers_bank_voucher_id_fkey"
            columns: ["bank_voucher_id"]
            isOneToOne: false
            referencedRelation: "bank_vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_vouchers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_vouchers_cash_voucher_id_fkey"
            columns: ["cash_voucher_id"]
            isOneToOne: false
            referencedRelation: "cash_vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_vouchers_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_vouchers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_vouchers_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_vouchers_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_vouchers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_vouchers_stock_voucher_id_fkey"
            columns: ["stock_voucher_id"]
            isOneToOne: false
            referencedRelation: "stock_vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_vouchers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_vouchers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_vouchers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      report_notes: {
        Row: {
          content: string
          id: string
          section: string
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          id?: string
          section: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          id?: string
          section?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      report_snapshots: {
        Row: {
          created_at: string
          id: string
          payload: Json
          period_from: string | null
          period_to: string
          report_type: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload: Json
          period_from?: string | null
          period_to: string
          report_type: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          period_from?: string | null
          period_to?: string
          report_type?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      resolver_weight_profile: {
        Row: {
          heuristic_min_conf: number
          sample_size: number
          tenant_id: string
          updated_at: string
          w_history: number
          w_price: number
          w_sku: number
          w_text: number
          w_unit: number
        }
        Insert: {
          heuristic_min_conf?: number
          sample_size?: number
          tenant_id: string
          updated_at?: string
          w_history?: number
          w_price?: number
          w_sku?: number
          w_text?: number
          w_unit?: number
        }
        Update: {
          heuristic_min_conf?: number
          sample_size?: number
          tenant_id?: string
          updated_at?: string
          w_history?: number
          w_price?: number
          w_sku?: number
          w_text?: number
          w_unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "resolver_weight_profile_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_components: {
        Row: {
          active: boolean
          code: string
          created_at: string
          expense_account: string | null
          id: string
          is_fixed: boolean
          is_insurable: boolean
          is_taxable: boolean
          kind: string
          name: string
          notes: string | null
          ot_multiplier: number
          sort_order: number
          taxable_threshold: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          expense_account?: string | null
          id?: string
          is_fixed?: boolean
          is_insurable?: boolean
          is_taxable?: boolean
          kind?: string
          name: string
          notes?: string | null
          ot_multiplier?: number
          sort_order?: number
          taxable_threshold?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          expense_account?: string | null
          id?: string
          is_fixed?: boolean
          is_insurable?: boolean
          is_taxable?: boolean
          kind?: string
          name?: string
          notes?: string | null
          ot_multiplier?: number
          sort_order?: number
          taxable_threshold?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_components_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoice_lines: {
        Row: {
          amount: number
          description: string
          id: string
          invoice_id: string
          line_discount_amount: number
          line_discount_percent: number
          line_vat_amount: number
          pre_vat_amount: number
          product_id: string | null
          qty: number
          sales_order_line_id: string | null
          unit_price: number
          vat_code: string
          vat_rate: number
        }
        Insert: {
          amount?: number
          description: string
          id?: string
          invoice_id: string
          line_discount_amount?: number
          line_discount_percent?: number
          line_vat_amount?: number
          pre_vat_amount?: number
          product_id?: string | null
          qty?: number
          sales_order_line_id?: string | null
          unit_price?: number
          vat_code?: string
          vat_rate?: number
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          invoice_id?: string
          line_discount_amount?: number
          line_discount_percent?: number
          line_vat_amount?: number
          pre_vat_amount?: number
          product_id?: string | null
          qty?: number
          sales_order_line_id?: string | null
          unit_price?: number
          vat_code?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_lines_product_fk"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_lines_sales_order_line_id_fkey"
            columns: ["sales_order_line_id"]
            isOneToOne: false
            referencedRelation: "sales_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoices: {
        Row: {
          billing_address: string | null
          branch_id: string | null
          cost_center_id: string | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_tax_id: string | null
          department_id: string | null
          discount_amount: number
          discount_percent: number
          due_date: string | null
          einvoice_code: string | null
          einvoice_qr: string | null
          einvoice_template_id: string | null
          fx_rate: number
          id: string
          invoice_no: string | null
          invoice_series: string | null
          issue_date: string
          journal_entry_id: string | null
          notes: string | null
          other_fees: number
          paid_amount: number
          payment_status: string
          payment_terms_days: number | null
          posted_at: string | null
          project_id: string | null
          quote_id: string | null
          sales_order_id: string | null
          send_status: string
          sent_at: string | null
          shipping_address: string | null
          shipping_fee: number
          status: string
          subtotal: number
          tenant_id: string | null
          total: number
          updated_at: string
          user_id: string
          vat_amount: number
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          billing_address?: string | null
          branch_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_tax_id?: string | null
          department_id?: string | null
          discount_amount?: number
          discount_percent?: number
          due_date?: string | null
          einvoice_code?: string | null
          einvoice_qr?: string | null
          einvoice_template_id?: string | null
          fx_rate?: number
          id?: string
          invoice_no?: string | null
          invoice_series?: string | null
          issue_date?: string
          journal_entry_id?: string | null
          notes?: string | null
          other_fees?: number
          paid_amount?: number
          payment_status?: string
          payment_terms_days?: number | null
          posted_at?: string | null
          project_id?: string | null
          quote_id?: string | null
          sales_order_id?: string | null
          send_status?: string
          sent_at?: string | null
          shipping_address?: string | null
          shipping_fee?: number
          status?: string
          subtotal?: number
          tenant_id?: string | null
          total?: number
          updated_at?: string
          user_id: string
          vat_amount?: number
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          billing_address?: string | null
          branch_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_tax_id?: string | null
          department_id?: string | null
          discount_amount?: number
          discount_percent?: number
          due_date?: string | null
          einvoice_code?: string | null
          einvoice_qr?: string | null
          einvoice_template_id?: string | null
          fx_rate?: number
          id?: string
          invoice_no?: string | null
          invoice_series?: string | null
          issue_date?: string
          journal_entry_id?: string | null
          notes?: string | null
          other_fees?: number
          paid_amount?: number
          payment_status?: string
          payment_terms_days?: number | null
          posted_at?: string | null
          project_id?: string | null
          quote_id?: string | null
          sales_order_id?: string | null
          send_status?: string
          sent_at?: string | null
          shipping_address?: string | null
          shipping_fee?: number
          status?: string
          subtotal?: number
          tenant_id?: string | null
          total?: number
          updated_at?: string
          user_id?: string
          vat_amount?: number
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_customer_fk"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_deposits: {
        Row: {
          advance_account: string
          amount: number
          applied_to_invoice_id: string | null
          branch_id: string | null
          cash_account: string | null
          cost_center_id: string | null
          created_at: string
          department_id: string | null
          deposit_no: string
          id: string
          journal_entry_id: string | null
          method: string
          notes: string | null
          order_id: string
          pay_date: string
          posted_at: string | null
          project_id: string | null
          reference: string | null
          status: string
          tenant_id: string | null
          updated_at: string
          user_id: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          advance_account?: string
          amount: number
          applied_to_invoice_id?: string | null
          branch_id?: string | null
          cash_account?: string | null
          cost_center_id?: string | null
          created_at?: string
          department_id?: string | null
          deposit_no: string
          id?: string
          journal_entry_id?: string | null
          method?: string
          notes?: string | null
          order_id: string
          pay_date?: string
          posted_at?: string | null
          project_id?: string | null
          reference?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          advance_account?: string
          amount?: number
          applied_to_invoice_id?: string | null
          branch_id?: string | null
          cash_account?: string | null
          cost_center_id?: string | null
          created_at?: string
          department_id?: string | null
          deposit_no?: string
          id?: string
          journal_entry_id?: string | null
          method?: string
          notes?: string | null
          order_id?: string
          pay_date?: string
          posted_at?: string | null
          project_id?: string | null
          reference?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_deposits_applied_to_invoice_id_fkey"
            columns: ["applied_to_invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_deposits_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_deposits_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_deposits_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_deposits_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_deposits_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_deposits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_lines: {
        Row: {
          amount: number
          description: string
          discount_amount: number
          discount_percent: number
          id: string
          line_no: number
          notes: string | null
          order_id: string
          pre_vat_amount: number
          product_id: string | null
          qty_delivered: number
          qty_ordered: number
          unit: string | null
          unit_price: number
          vat_amount: number
          vat_rate: number
          warehouse_id: string | null
        }
        Insert: {
          amount?: number
          description: string
          discount_amount?: number
          discount_percent?: number
          id?: string
          line_no?: number
          notes?: string | null
          order_id: string
          pre_vat_amount?: number
          product_id?: string | null
          qty_delivered?: number
          qty_ordered?: number
          unit?: string | null
          unit_price?: number
          vat_amount?: number
          vat_rate?: number
          warehouse_id?: string | null
        }
        Update: {
          amount?: number
          description?: string
          discount_amount?: number
          discount_percent?: number
          id?: string
          line_no?: number
          notes?: string | null
          order_id?: string
          pre_vat_amount?: number
          product_id?: string | null
          qty_delivered?: number
          qty_ordered?: number
          unit?: string | null
          unit_price?: number
          vat_amount?: number
          vat_rate?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          billing_address: string | null
          branch_id: string | null
          cancel_reason: string | null
          closed_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          cost_center_id: string | null
          created_at: string
          currency: string
          customer_id: string | null
          customer_name: string | null
          customer_tax_id: string | null
          department_id: string | null
          deposit_due_date: string | null
          deposit_enabled: boolean
          deposit_percent: number | null
          deposit_received: number
          deposit_required: number
          deposit_status: string
          discount_amount: number
          expected_delivery_date: string | null
          fx_rate: number
          id: string
          internal_notes: string | null
          notes: string | null
          order_date: string
          order_no: string
          payment_terms_days: number | null
          project_id: string | null
          reserve_enabled: boolean
          salesperson_id: string | null
          ship_address: string | null
          status: string
          subtotal: number
          tenant_id: string | null
          total: number
          updated_at: string
          user_id: string
          valid_until: string | null
          vat_amount: number
        }
        Insert: {
          billing_address?: string | null
          branch_id?: string | null
          cancel_reason?: string | null
          closed_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_tax_id?: string | null
          department_id?: string | null
          deposit_due_date?: string | null
          deposit_enabled?: boolean
          deposit_percent?: number | null
          deposit_received?: number
          deposit_required?: number
          deposit_status?: string
          discount_amount?: number
          expected_delivery_date?: string | null
          fx_rate?: number
          id?: string
          internal_notes?: string | null
          notes?: string | null
          order_date?: string
          order_no: string
          payment_terms_days?: number | null
          project_id?: string | null
          reserve_enabled?: boolean
          salesperson_id?: string | null
          ship_address?: string | null
          status?: string
          subtotal?: number
          tenant_id?: string | null
          total?: number
          updated_at?: string
          user_id: string
          valid_until?: string | null
          vat_amount?: number
        }
        Update: {
          billing_address?: string | null
          branch_id?: string | null
          cancel_reason?: string | null
          closed_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_tax_id?: string | null
          department_id?: string | null
          deposit_due_date?: string | null
          deposit_enabled?: boolean
          deposit_percent?: number | null
          deposit_received?: number
          deposit_required?: number
          deposit_status?: string
          discount_amount?: number
          expected_delivery_date?: string | null
          fx_rate?: number
          id?: string
          internal_notes?: string | null
          notes?: string | null
          order_date?: string
          order_no?: string
          payment_terms_days?: number | null
          project_id?: string | null
          reserve_enabled?: boolean
          salesperson_id?: string | null
          ship_address?: string | null
          status?: string
          subtotal?: number
          tenant_id?: string | null
          total?: number
          updated_at?: string
          user_id?: string
          valid_until?: string | null
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_voucher_lines: {
        Row: {
          amount: number
          cost_amount: number
          created_at: string
          credit_account: string | null
          debit_account: string | null
          description: string | null
          discount_amount: number
          discount_pct: number
          id: string
          line_order: number
          line_type: string
          note: string | null
          product_code: string | null
          product_id: string | null
          product_name: string | null
          qty: number
          sales_order_line_id: string | null
          total: number
          unit: string | null
          unit_price: number
          vat_account: string | null
          vat_amount: number
          vat_rate: number
          voucher_id: string
        }
        Insert: {
          amount?: number
          cost_amount?: number
          created_at?: string
          credit_account?: string | null
          debit_account?: string | null
          description?: string | null
          discount_amount?: number
          discount_pct?: number
          id?: string
          line_order?: number
          line_type?: string
          note?: string | null
          product_code?: string | null
          product_id?: string | null
          product_name?: string | null
          qty?: number
          sales_order_line_id?: string | null
          total?: number
          unit?: string | null
          unit_price?: number
          vat_account?: string | null
          vat_amount?: number
          vat_rate?: number
          voucher_id: string
        }
        Update: {
          amount?: number
          cost_amount?: number
          created_at?: string
          credit_account?: string | null
          debit_account?: string | null
          description?: string | null
          discount_amount?: number
          discount_pct?: number
          id?: string
          line_order?: number
          line_type?: string
          note?: string | null
          product_code?: string | null
          product_id?: string | null
          product_name?: string | null
          qty?: number
          sales_order_line_id?: string | null
          total?: number
          unit?: string | null
          unit_price?: number
          vat_account?: string | null
          vat_amount?: number
          vat_rate?: number
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_voucher_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_voucher_lines_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "sales_vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_vouchers: {
        Row: {
          bank_voucher_id: string | null
          branch_id: string | null
          buyer_name: string | null
          cash_voucher_id: string | null
          cost_center_id: string | null
          create_stock_voucher: boolean
          created_at: string
          credit_account: string
          currency: string | null
          customer_address: string | null
          customer_group: string | null
          customer_id: string | null
          customer_name: string | null
          customer_tax_id: string | null
          debit_account: string
          department_id: string | null
          discount_amount: number
          discount_pct: number
          due_date: string | null
          einvoice_id: string | null
          einvoice_no: string | null
          einvoice_series: string | null
          exchange_rate: number
          id: string
          issue_einvoice: boolean
          journal_entry_id: string | null
          notes: string | null
          paid_amount: number
          pay_now: boolean
          payment_account: string | null
          payment_method: string
          payment_status: string
          posted_at: string | null
          project_id: string | null
          reason: string | null
          sales_order_id: string | null
          salesperson_id: string | null
          salesperson_name: string | null
          status: string
          stock_voucher_date: string | null
          stock_voucher_id: string | null
          stock_voucher_no: string | null
          stock_voucher_reason: string | null
          subtotal: number
          tenant_id: string | null
          total: number
          updated_at: string
          user_id: string
          vat_account: string | null
          vat_amount: number
          void_reason: string | null
          voided_at: string | null
          voucher_date: string
          voucher_no: string
          warehouse_id: string | null
        }
        Insert: {
          bank_voucher_id?: string | null
          branch_id?: string | null
          buyer_name?: string | null
          cash_voucher_id?: string | null
          cost_center_id?: string | null
          create_stock_voucher?: boolean
          created_at?: string
          credit_account?: string
          currency?: string | null
          customer_address?: string | null
          customer_group?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_tax_id?: string | null
          debit_account?: string
          department_id?: string | null
          discount_amount?: number
          discount_pct?: number
          due_date?: string | null
          einvoice_id?: string | null
          einvoice_no?: string | null
          einvoice_series?: string | null
          exchange_rate?: number
          id?: string
          issue_einvoice?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          paid_amount?: number
          pay_now?: boolean
          payment_account?: string | null
          payment_method?: string
          payment_status?: string
          posted_at?: string | null
          project_id?: string | null
          reason?: string | null
          sales_order_id?: string | null
          salesperson_id?: string | null
          salesperson_name?: string | null
          status?: string
          stock_voucher_date?: string | null
          stock_voucher_id?: string | null
          stock_voucher_no?: string | null
          stock_voucher_reason?: string | null
          subtotal?: number
          tenant_id?: string | null
          total?: number
          updated_at?: string
          user_id: string
          vat_account?: string | null
          vat_amount?: number
          void_reason?: string | null
          voided_at?: string | null
          voucher_date?: string
          voucher_no: string
          warehouse_id?: string | null
        }
        Update: {
          bank_voucher_id?: string | null
          branch_id?: string | null
          buyer_name?: string | null
          cash_voucher_id?: string | null
          cost_center_id?: string | null
          create_stock_voucher?: boolean
          created_at?: string
          credit_account?: string
          currency?: string | null
          customer_address?: string | null
          customer_group?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_tax_id?: string | null
          debit_account?: string
          department_id?: string | null
          discount_amount?: number
          discount_pct?: number
          due_date?: string | null
          einvoice_id?: string | null
          einvoice_no?: string | null
          einvoice_series?: string | null
          exchange_rate?: number
          id?: string
          issue_einvoice?: boolean
          journal_entry_id?: string | null
          notes?: string | null
          paid_amount?: number
          pay_now?: boolean
          payment_account?: string | null
          payment_method?: string
          payment_status?: string
          posted_at?: string | null
          project_id?: string | null
          reason?: string | null
          sales_order_id?: string | null
          salesperson_id?: string | null
          salesperson_name?: string | null
          status?: string
          stock_voucher_date?: string | null
          stock_voucher_id?: string | null
          stock_voucher_no?: string | null
          stock_voucher_reason?: string | null
          subtotal?: number
          tenant_id?: string | null
          total?: number
          updated_at?: string
          user_id?: string
          vat_account?: string | null
          vat_amount?: number
          void_reason?: string | null
          voided_at?: string | null
          voucher_date?: string
          voucher_no?: string
          warehouse_id?: string | null
        }
        Relationships: []
      }
      security_policies: {
        Row: {
          id: number
          ip_allowlist_enabled: boolean
          require_2fa_for_roles: Json
          session_timeout_minutes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: number
          ip_allowlist_enabled?: boolean
          require_2fa_for_roles?: Json
          session_timeout_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: number
          ip_allowlist_enabled?: boolean
          require_2fa_for_roles?: Json
          session_timeout_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          conversion_factor: number
          costing_method: string | null
          created_at: string
          id: string
          movement_date: string
          movement_type: string
          note: string | null
          product_id: string
          qty: number
          ref_id: string | null
          ref_type: string | null
          tenant_id: string | null
          txn_qty: number | null
          txn_unit: string | null
          txn_unit_cost: number | null
          unit_cost: number
          user_id: string
          voucher_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          conversion_factor?: number
          costing_method?: string | null
          created_at?: string
          id?: string
          movement_date?: string
          movement_type: string
          note?: string | null
          product_id: string
          qty: number
          ref_id?: string | null
          ref_type?: string | null
          tenant_id?: string | null
          txn_qty?: number | null
          txn_unit?: string | null
          txn_unit_cost?: number | null
          unit_cost?: number
          user_id: string
          voucher_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          conversion_factor?: number
          costing_method?: string | null
          created_at?: string
          id?: string
          movement_date?: string
          movement_type?: string
          note?: string | null
          product_id?: string
          qty?: number
          ref_id?: string | null
          ref_type?: string | null
          tenant_id?: string | null
          txn_qty?: number | null
          txn_unit?: string | null
          txn_unit_cost?: number | null
          unit_cost?: number
          user_id?: string
          voucher_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "stock_vouchers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_reservations: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          notes: string | null
          product_id: string
          qty_released: number
          qty_reserved: number
          ref_id: string
          ref_type: string
          released_at: string | null
          reserved_at: string
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          product_id: string
          qty_released?: number
          qty_reserved: number
          ref_id: string
          ref_type?: string
          released_at?: string | null
          reserved_at?: string
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          qty_released?: number
          qty_reserved?: number
          ref_id?: string
          ref_type?: string
          released_at?: string | null
          reserved_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_take_lines: {
        Row: {
          counted_qty: number
          diff_qty: number
          diff_value: number
          id: string
          note: string | null
          product_id: string
          stock_take_id: string
          system_qty: number
          unit_cost: number
        }
        Insert: {
          counted_qty?: number
          diff_qty?: number
          diff_value?: number
          id?: string
          note?: string | null
          product_id: string
          stock_take_id: string
          system_qty?: number
          unit_cost?: number
        }
        Update: {
          counted_qty?: number
          diff_qty?: number
          diff_value?: number
          id?: string
          note?: string | null
          product_id?: string
          stock_take_id?: string
          system_qty?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_take_lines_product_fk"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_take_lines_stock_take_id_fkey"
            columns: ["stock_take_id"]
            isOneToOne: false
            referencedRelation: "stock_takes"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_takes: {
        Row: {
          code: string
          created_at: string
          id: string
          journal_entry_id: string | null
          notes: string | null
          posted_at: string | null
          status: string
          take_date: string
          tenant_id: string | null
          updated_at: string
          user_id: string
          warehouse: string | null
          warehouse_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          posted_at?: string | null
          status?: string
          take_date?: string
          tenant_id?: string | null
          updated_at?: string
          user_id: string
          warehouse?: string | null
          warehouse_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          posted_at?: string | null
          status?: string
          take_date?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
          warehouse?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_takes_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_takes_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_vouchers: {
        Row: {
          attachments_count: number | null
          branch_id: string | null
          counter_account: string
          created_at: string
          deliverer_name: string | null
          id: string
          journal_entry_id: string | null
          kind: string | null
          party_address: string | null
          party_id: string | null
          party_name: string | null
          party_phone: string | null
          reason: string | null
          receiver_name: string | null
          source_doc_date: string | null
          source_doc_no: string | null
          target_warehouse_id: string | null
          tenant_id: string | null
          transfer_doc_no: string | null
          user_id: string
          voucher_date: string
          voucher_no: string
          voucher_type: string
          warehouse_id: string | null
        }
        Insert: {
          attachments_count?: number | null
          branch_id?: string | null
          counter_account: string
          created_at?: string
          deliverer_name?: string | null
          id?: string
          journal_entry_id?: string | null
          kind?: string | null
          party_address?: string | null
          party_id?: string | null
          party_name?: string | null
          party_phone?: string | null
          reason?: string | null
          receiver_name?: string | null
          source_doc_date?: string | null
          source_doc_no?: string | null
          target_warehouse_id?: string | null
          tenant_id?: string | null
          transfer_doc_no?: string | null
          user_id: string
          voucher_date?: string
          voucher_no: string
          voucher_type: string
          warehouse_id?: string | null
        }
        Update: {
          attachments_count?: number | null
          branch_id?: string | null
          counter_account?: string
          created_at?: string
          deliverer_name?: string | null
          id?: string
          journal_entry_id?: string | null
          kind?: string | null
          party_address?: string | null
          party_id?: string | null
          party_name?: string | null
          party_phone?: string | null
          reason?: string | null
          receiver_name?: string | null
          source_doc_date?: string | null
          source_doc_no?: string | null
          target_warehouse_id?: string | null
          tenant_id?: string | null
          transfer_doc_no?: string | null
          user_id?: string
          voucher_date?: string
          voucher_no?: string
          voucher_type?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_vouchers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_vouchers_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_vouchers_target_warehouse_id_fkey"
            columns: ["target_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_vouchers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_groups: {
        Row: {
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_groups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "supplier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_item_mappings: {
        Row: {
          confidence: number
          created_at: string
          created_by: string | null
          id: string
          last_seen: string
          match_count: number
          product_id: string | null
          purpose_code: string | null
          raw_name: string
          raw_name_norm: string
          raw_unit: string | null
          reasoning: string | null
          source: string
          supplier_id: string
          tenant_id: string
          unit_conversion_factor: number
          updated_at: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          id?: string
          last_seen?: string
          match_count?: number
          product_id?: string | null
          purpose_code?: string | null
          raw_name: string
          raw_name_norm: string
          raw_unit?: string | null
          reasoning?: string | null
          source?: string
          supplier_id: string
          tenant_id: string
          unit_conversion_factor?: number
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          id?: string
          last_seen?: string
          match_count?: number
          product_id?: string | null
          purpose_code?: string | null
          raw_name?: string
          raw_name_norm?: string
          raw_unit?: string | null
          reasoning?: string | null
          source?: string
          supplier_id?: string
          tenant_id?: string
          unit_conversion_factor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_item_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_item_mappings_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_item_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          branch_id: string | null
          cost_center_id: string | null
          created_at: string
          id: string
          invoice_id: string | null
          journal_entry_id: string | null
          method: string
          pay_date: string
          posted_at: string | null
          project_id: string | null
          reference: string | null
          status: string
          supplier_id: string | null
          supplier_name: string | null
          tenant_id: string | null
          user_id: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          amount: number
          branch_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          journal_entry_id?: string | null
          method?: string
          pay_date?: string
          posted_at?: string | null
          project_id?: string | null
          reference?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          tenant_id?: string | null
          user_id: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          journal_entry_id?: string | null
          method?: string
          pay_date?: string
          posted_at?: string | null
          project_id?: string | null
          reference?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          tenant_id?: string | null
          user_id?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          bank_account_no: string | null
          bank_branch: string | null
          bank_name: string | null
          blacklist_reason: string | null
          branch_tax_id: string | null
          code: string | null
          contact_email2: string | null
          contact_person: string | null
          contact_phone2: string | null
          country: string | null
          created_at: string
          credit_limit: number | null
          currency: string
          default_expense_account: string | null
          default_vat_rate: number | null
          email: string | null
          fax: string | null
          group_id: string | null
          id: string
          industry_code: string | null
          is_active: boolean
          legal_rep: string | null
          name: string
          notes: string | null
          opening_balance_credit: number
          opening_balance_debit: number
          party_type: string
          payable_account: string
          payment_terms_days: number
          phone: string | null
          risk_flag: string | null
          roles: string[]
          tax_id: string | null
          tax_office: string | null
          tenant_id: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          bank_account_no?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          blacklist_reason?: string | null
          branch_tax_id?: string | null
          code?: string | null
          contact_email2?: string | null
          contact_person?: string | null
          contact_phone2?: string | null
          country?: string | null
          created_at?: string
          credit_limit?: number | null
          currency?: string
          default_expense_account?: string | null
          default_vat_rate?: number | null
          email?: string | null
          fax?: string | null
          group_id?: string | null
          id?: string
          industry_code?: string | null
          is_active?: boolean
          legal_rep?: string | null
          name: string
          notes?: string | null
          opening_balance_credit?: number
          opening_balance_debit?: number
          party_type?: string
          payable_account?: string
          payment_terms_days?: number
          phone?: string | null
          risk_flag?: string | null
          roles?: string[]
          tax_id?: string | null
          tax_office?: string | null
          tenant_id?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string | null
          bank_account_no?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          blacklist_reason?: string | null
          branch_tax_id?: string | null
          code?: string | null
          contact_email2?: string | null
          contact_person?: string | null
          contact_phone2?: string | null
          country?: string | null
          created_at?: string
          credit_limit?: number | null
          currency?: string
          default_expense_account?: string | null
          default_vat_rate?: number | null
          email?: string | null
          fax?: string | null
          group_id?: string | null
          id?: string
          industry_code?: string | null
          is_active?: boolean
          legal_rep?: string | null
          name?: string
          notes?: string | null
          opening_balance_credit?: number
          opening_balance_debit?: number
          party_type?: string
          payable_account?: string
          payment_terms_days?: number
          phone?: string | null
          risk_flag?: string | null
          roles?: string[]
          tax_id?: string | null
          tax_office?: string | null
          tenant_id?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "supplier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      system_backups: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          file_path: string | null
          finished_at: string | null
          id: string
          kind: string
          row_counts: Json | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          file_path?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          row_counts?: Json | null
          status?: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          file_path?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          row_counts?: Json | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_backups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_job_runs: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          id: string
          job: string
          output: Json | null
          params: Json | null
          started_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job: string
          output?: Json | null
          params?: Json | null
          started_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          job?: string
          output?: Json | null
          params?: Json | null
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          id: number
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: number
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: number
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      tenant_catalog_pins: {
        Row: {
          catalog_name: string
          last_ack_at: string
          last_ack_by: string | null
          pinned_version: number
          tenant_id: string
        }
        Insert: {
          catalog_name: string
          last_ack_at?: string
          last_ack_by?: string | null
          pinned_version?: number
          tenant_id: string
        }
        Update: {
          catalog_name?: string
          last_ack_at?: string
          last_ack_by?: string | null
          pinned_version?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_catalog_pins_catalog_name_fkey"
            columns: ["catalog_name"]
            isOneToOne: false
            referencedRelation: "master_catalogs"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "tenant_catalog_pins_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_coa_overrides: {
        Row: {
          account_code: string
          action: string
          created_at: string
          created_by: string | null
          id: string
          name: string | null
          notes: string | null
          parent_code: string | null
          tenant_id: string
          type: string | null
          updated_at: string
        }
        Insert: {
          account_code: string
          action: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          parent_code?: string | null
          tenant_id: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          account_code?: string
          action?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          parent_code?: string | null
          tenant_id?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_coa_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["tenant_role"]
          status: Database["public"]["Enums"]["tenant_member_status"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          status?: Database["public"]["Enums"]["tenant_member_status"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          status?: Database["public"]["Enums"]["tenant_member_status"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_plans: {
        Row: {
          ai_tokens_quota: number | null
          notes: string | null
          period_end: string | null
          period_start: string | null
          plan: string
          seats_limit: number | null
          status: string
          storage_quota_mb: number | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_tokens_quota?: number | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          plan?: string
          seats_limit?: number | null
          status?: string
          storage_quota_mb?: number | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_tokens_quota?: number | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          plan?: string
          seats_limit?: number | null
          status?: string
          storage_quota_mb?: number | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_product_catalog: {
        Row: {
          aliases: string[]
          category: string | null
          created_at: string
          created_by: string | null
          default_account: string | null
          deprecated_in_version: number | null
          effective_from: string
          id: string
          is_global: boolean
          item_type: string | null
          name: string
          name_norm: string
          note: string | null
          sku: string | null
          status: string
          subcategory: string | null
          tenant_id: string | null
          updated_at: string
          vat_rate: number | null
          version: number
        }
        Insert: {
          aliases?: string[]
          category?: string | null
          created_at?: string
          created_by?: string | null
          default_account?: string | null
          deprecated_in_version?: number | null
          effective_from?: string
          id?: string
          is_global?: boolean
          item_type?: string | null
          name: string
          name_norm: string
          note?: string | null
          sku?: string | null
          status?: string
          subcategory?: string | null
          tenant_id?: string | null
          updated_at?: string
          vat_rate?: number | null
          version?: number
        }
        Update: {
          aliases?: string[]
          category?: string | null
          created_at?: string
          created_by?: string | null
          default_account?: string | null
          deprecated_in_version?: number | null
          effective_from?: string
          id?: string
          is_global?: boolean
          item_type?: string | null
          name?: string
          name_norm?: string
          note?: string | null
          sku?: string | null
          status?: string
          subcategory?: string | null
          tenant_id?: string | null
          updated_at?: string
          vat_rate?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_product_catalog_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_usage: {
        Row: {
          ai_files_parsed: number
          ai_tokens_used: number
          documents_count: number
          period_ym: string
          storage_used_mb: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ai_files_parsed?: number
          ai_tokens_used?: number
          documents_count?: number
          period_ym: string
          storage_used_mb?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ai_files_parsed?: number
          ai_tokens_used?: number
          documents_count?: number
          period_ym?: string
          storage_used_mb?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          accounting_standard: string
          address: string | null
          base_currency: string
          billing_address: string | null
          business_reg_date: string | null
          business_reg_no: string | null
          business_reg_place: string | null
          business_types: string[]
          ccdc_allocation_threshold: number
          chief_accountant_cert_no: string | null
          chief_accountant_name: string | null
          company_name: string | null
          created_at: string
          default_cost_center: string
          email: string | null
          established_date: string | null
          fax: string | null
          fiscal_year_start: number
          fiscal_year_start_day: number
          id: string
          industries: Json
          industry_code: string | null
          industry_name: string | null
          legal_form: string | null
          legal_rep_id_date: string | null
          legal_rep_id_no: string | null
          legal_rep_name: string | null
          legal_rep_phone: string | null
          legal_rep_title: string | null
          logo_url: string | null
          name: string
          owner_user_id: string
          phone: string | null
          pit_period: string | null
          preparer_name: string | null
          setup_completed: boolean
          setup_completed_at: string | null
          shipping_address: string | null
          signature_url: string | null
          stamp_url: string | null
          status: string
          suspended_at: string | null
          suspended_reason: string | null
          tax_authority: string | null
          tax_id: string | null
          tax_method: string | null
          trade_name: string | null
          updated_at: string
          vat_period: string | null
          website: string | null
        }
        Insert: {
          accounting_standard?: string
          address?: string | null
          base_currency?: string
          billing_address?: string | null
          business_reg_date?: string | null
          business_reg_no?: string | null
          business_reg_place?: string | null
          business_types?: string[]
          ccdc_allocation_threshold?: number
          chief_accountant_cert_no?: string | null
          chief_accountant_name?: string | null
          company_name?: string | null
          created_at?: string
          default_cost_center?: string
          email?: string | null
          established_date?: string | null
          fax?: string | null
          fiscal_year_start?: number
          fiscal_year_start_day?: number
          id?: string
          industries?: Json
          industry_code?: string | null
          industry_name?: string | null
          legal_form?: string | null
          legal_rep_id_date?: string | null
          legal_rep_id_no?: string | null
          legal_rep_name?: string | null
          legal_rep_phone?: string | null
          legal_rep_title?: string | null
          logo_url?: string | null
          name: string
          owner_user_id: string
          phone?: string | null
          pit_period?: string | null
          preparer_name?: string | null
          setup_completed?: boolean
          setup_completed_at?: string | null
          shipping_address?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          status?: string
          suspended_at?: string | null
          suspended_reason?: string | null
          tax_authority?: string | null
          tax_id?: string | null
          tax_method?: string | null
          trade_name?: string | null
          updated_at?: string
          vat_period?: string | null
          website?: string | null
        }
        Update: {
          accounting_standard?: string
          address?: string | null
          base_currency?: string
          billing_address?: string | null
          business_reg_date?: string | null
          business_reg_no?: string | null
          business_reg_place?: string | null
          business_types?: string[]
          ccdc_allocation_threshold?: number
          chief_accountant_cert_no?: string | null
          chief_accountant_name?: string | null
          company_name?: string | null
          created_at?: string
          default_cost_center?: string
          email?: string | null
          established_date?: string | null
          fax?: string | null
          fiscal_year_start?: number
          fiscal_year_start_day?: number
          id?: string
          industries?: Json
          industry_code?: string | null
          industry_name?: string | null
          legal_form?: string | null
          legal_rep_id_date?: string | null
          legal_rep_id_no?: string | null
          legal_rep_name?: string | null
          legal_rep_phone?: string | null
          legal_rep_title?: string | null
          logo_url?: string | null
          name?: string
          owner_user_id?: string
          phone?: string | null
          pit_period?: string | null
          preparer_name?: string | null
          setup_completed?: boolean
          setup_completed_at?: string | null
          shipping_address?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          status?: string
          suspended_at?: string | null
          suspended_reason?: string | null
          tax_authority?: string | null
          tax_id?: string | null
          tax_method?: string | null
          trade_name?: string | null
          updated_at?: string
          vat_period?: string | null
          website?: string | null
        }
        Relationships: []
      }
      timesheets: {
        Row: {
          actual_days: number
          created_at: string
          employee_id: string
          id: string
          night_hours: number
          notes: string | null
          ot_150_hours: number
          ot_200_hours: number
          ot_300_hours: number
          paid_leave_days: number
          period_month: string
          standard_days: number
          tenant_id: string
          unpaid_leave_days: number
          updated_at: string
        }
        Insert: {
          actual_days?: number
          created_at?: string
          employee_id: string
          id?: string
          night_hours?: number
          notes?: string | null
          ot_150_hours?: number
          ot_200_hours?: number
          ot_300_hours?: number
          paid_leave_days?: number
          period_month: string
          standard_days?: number
          tenant_id: string
          unpaid_leave_days?: number
          updated_at?: string
        }
        Update: {
          actual_days?: number
          created_at?: string
          employee_id?: string
          id?: string
          night_hours?: number
          notes?: string | null
          ot_150_hours?: number
          ot_200_hours?: number
          ot_300_hours?: number
          paid_leave_days?: number
          period_month?: string
          standard_days?: number
          tenant_id?: string
          unpaid_leave_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      typeb_purpose_catalog: {
        Row: {
          account_tt133: string
          account_tt99: string
          aliases: string[]
          cit_cap: string | null
          cit_warning: string | null
          code: string
          created_at: string
          floating_goods: string[]
          group_code: string
          id: string
          is_active: boolean
          legal_basis: string | null
          line_kind: string
          name: string
          name_en: string | null
          needs_vat_output: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_tt133: string
          account_tt99: string
          aliases?: string[]
          cit_cap?: string | null
          cit_warning?: string | null
          code: string
          created_at?: string
          floating_goods?: string[]
          group_code: string
          id?: string
          is_active?: boolean
          legal_basis?: string | null
          line_kind?: string
          name: string
          name_en?: string | null
          needs_vat_output?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_tt133?: string
          account_tt99?: string
          aliases?: string[]
          cit_cap?: string | null
          cit_warning?: string | null
          code?: string
          created_at?: string
          floating_goods?: string[]
          group_code?: string
          id?: string
          is_active?: boolean
          legal_basis?: string | null
          line_kind?: string
          name?: string
          name_en?: string | null
          needs_vat_output?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_digest_prefs: {
        Row: {
          created_at: string
          enabled: boolean
          last_sent_date: string | null
          send_hour: number
          template: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          last_sent_date?: string | null
          send_hour?: number
          template?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          last_sent_date?: string | null
          send_hour?: number
          template?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_digest_prefs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          tenant_id: string | null
          tenant_owner_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role: string
          tenant_id?: string | null
          tenant_owner_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          tenant_id?: string | null
          tenant_owner_id?: string
          token?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendor_raw_embeddings: {
        Row: {
          embedding: string
          model: string
          raw_name_norm: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          embedding: string
          model?: string
          raw_name_norm: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          embedding?: string
          model?: string
          raw_name_norm?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          address: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          manager: string | null
          name: string
          notes: string | null
          phone: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          manager?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          manager?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      mv_account_period_summary: {
        Row: {
          account_code: string | null
          period_credit: number | null
          period_debit: number | null
          period_no: number | null
          refreshed_at: string | null
          tenant_id: string | null
          year: number | null
          ytd_credit: number | null
          ytd_debit: number | null
        }
        Relationships: []
      }
      mv_ap_aging: {
        Row: {
          bucket_1_30: number | null
          bucket_31_60: number | null
          bucket_61_90: number | null
          bucket_current: number | null
          bucket_over_90: number | null
          open_invoices: number | null
          refreshed_at: string | null
          supplier_id: string | null
          tenant_id: string | null
          total_outstanding: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_ar_aging: {
        Row: {
          bucket_1_30: number | null
          bucket_31_60: number | null
          bucket_61_90: number | null
          bucket_current: number | null
          bucket_over_90: number | null
          customer_id: string | null
          open_invoices: number | null
          refreshed_at: string | null
          tenant_id: string | null
          total_outstanding: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_customer_fk"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_monthly_purchases_by_supplier: {
        Row: {
          expense: number | null
          invoice_count: number | null
          refreshed_at: string | null
          supplier_id: string | null
          tenant_id: string | null
          year_month: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_monthly_sales_by_customer: {
        Row: {
          collected: number | null
          customer_id: string | null
          invoice_count: number | null
          refreshed_at: string | null
          revenue: number | null
          tenant_id: string | null
          year_month: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_customer_fk"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      acknowledge_catalog_version: {
        Args: { p_catalog: string }
        Returns: number
      }
      apply_balance_delta: {
        Args: {
          p_account: string
          p_credit: number
          p_date: string
          p_debit: number
          p_tenant: string
        }
        Returns: undefined
      }
      apply_monthly_summary: {
        Args: {
          p_collected: number
          p_date: string
          p_paid: number
          p_purchase_count: number
          p_purchase_expense: number
          p_sales_count: number
          p_sales_revenue: number
          p_tenant: string
        }
        Returns: undefined
      }
      bump_rule_metrics: {
        Args: { _correct?: boolean; _rule_id: string }
        Returns: undefined
      }
      current_tenant_catalog_diff: {
        Args: { p_catalog: string }
        Returns: {
          code: string
          current_version: number
          kind: string
          name: string
          pinned_version: number
          status: string
          version: number
        }[]
      }
      current_tenant_id: { Args: never; Returns: string }
      fn_auto_match_bank_txn: { Args: { p_txn_id: string }; Returns: undefined }
      fn_parse_then_text: { Args: { p_text: string }; Returns: Json }
      fn_parse_when_text: { Args: { p_text: string }; Returns: Json }
      fn_product_available_qty: {
        Args: { p_product: string; p_warehouse: string }
        Returns: number
      }
      fn_product_on_hand: {
        Args: { p_product: string; p_warehouse: string }
        Returns: number
      }
      fn_product_reserved_qty: {
        Args: { p_product: string; p_warehouse: string }
        Returns: number
      }
      fn_release_reservation_for_so_line: {
        Args: { p_line_id: string }
        Returns: undefined
      }
      generate_fiscal_year: { Args: { p_year: number }; Returns: string }
      get_account_period_summary: {
        Args: { p_year?: number }
        Returns: {
          account_code: string | null
          period_credit: number | null
          period_debit: number | null
          period_no: number | null
          refreshed_at: string | null
          tenant_id: string | null
          year: number | null
          ytd_credit: number | null
          ytd_debit: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "mv_account_period_summary"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_ap_aging: {
        Args: never
        Returns: {
          bucket_1_30: number | null
          bucket_31_60: number | null
          bucket_61_90: number | null
          bucket_current: number | null
          bucket_over_90: number | null
          open_invoices: number | null
          refreshed_at: string | null
          supplier_id: string | null
          tenant_id: string | null
          total_outstanding: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "mv_ap_aging"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_ar_aging: {
        Args: never
        Returns: {
          bucket_1_30: number | null
          bucket_31_60: number | null
          bucket_61_90: number | null
          bucket_current: number | null
          bucket_over_90: number | null
          customer_id: string | null
          open_invoices: number | null
          refreshed_at: string | null
          tenant_id: string | null
          total_outstanding: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "mv_ar_aging"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_monthly_purchases_by_supplier: {
        Args: { p_year_month_from?: string; p_year_month_to?: string }
        Returns: {
          expense: number | null
          invoice_count: number | null
          refreshed_at: string | null
          supplier_id: string | null
          tenant_id: string | null
          year_month: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "mv_monthly_purchases_by_supplier"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_monthly_sales_by_customer: {
        Args: { p_year_month_from?: string; p_year_month_to?: string }
        Returns: {
          collected: number | null
          customer_id: string | null
          invoice_count: number | null
          refreshed_at: string | null
          revenue: number | null
          tenant_id: string | null
          year_month: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "mv_monthly_sales_by_customer"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_any_role: {
        Args: { _roles: string[]; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_tenant_role: {
        Args: { _roles: string[]; _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_period_hard_locked: {
        Args: { _date: string; _user_id: string }
        Returns: boolean
      }
      is_period_locked: {
        Args: { _date: string; _user_id: string }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_tenant_suspended: { Args: { _tenant: string }; Returns: boolean }
      match_products_for_vendor: {
        Args: {
          p_limit?: number
          p_query_embedding: string
          p_tenant_id: string
        }
        Returns: {
          product_id: string
          similarity: number
        }[]
      }
      merge_parties: {
        Args: { p_kind: string; p_primary: string; p_secondary: string }
        Returns: Json
      }
      office_generate_recurring_tasks: {
        Args: { p_agency?: string }
        Returns: number
      }
      rebuild_account_period_balances: {
        Args: { p_tenant?: string }
        Returns: undefined
      }
      rebuild_monthly_summary: {
        Args: { p_tenant?: string }
        Returns: undefined
      }
      record_rule_outcome: {
        Args: { _application_id: string; _correct: boolean }
        Returns: undefined
      }
      refresh_report_mvs: { Args: { p_tenant?: string }; Returns: undefined }
      refresh_sales_order_progress: {
        Args: { p_line_id: string }
        Returns: undefined
      }
      sync_tenant_to_context: { Args: { p_tenant: string }; Returns: undefined }
      transition_document_status: {
        Args: {
          p_id: string
          p_reason?: string
          p_table: string
          p_to_status: string
        }
        Returns: undefined
      }
      void_depreciation_entry: {
        Args: { _entry_id: string; _reason?: string }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "owner"
        | "chief_accountant"
        | "accountant"
        | "viewer"
        | "approver"
        | "superadmin"
      office_billing_cycle: "monthly" | "quarterly" | "yearly" | "one_off"
      office_contract_status: "draft" | "active" | "expired" | "terminated"
      office_link_status: "active" | "paused" | "terminated"
      office_prospect_status:
        | "new"
        | "contacted"
        | "negotiating"
        | "won"
        | "lost"
      office_staff_status: "active" | "on_leave" | "terminated"
      office_task_category:
        | "vat_filing"
        | "pit"
        | "cit"
        | "social_insurance"
        | "bookkeeping"
        | "financial_report"
        | "internal"
        | "other"
      office_task_priority: "low" | "med" | "high" | "urgent"
      office_task_status:
        | "todo"
        | "in_progress"
        | "review"
        | "done"
        | "cancelled"
      tenant_member_status: "active" | "invited" | "disabled"
      tenant_role: "owner" | "admin" | "accountant" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "owner",
        "chief_accountant",
        "accountant",
        "viewer",
        "approver",
        "superadmin",
      ],
      office_billing_cycle: ["monthly", "quarterly", "yearly", "one_off"],
      office_contract_status: ["draft", "active", "expired", "terminated"],
      office_link_status: ["active", "paused", "terminated"],
      office_prospect_status: [
        "new",
        "contacted",
        "negotiating",
        "won",
        "lost",
      ],
      office_staff_status: ["active", "on_leave", "terminated"],
      office_task_category: [
        "vat_filing",
        "pit",
        "cit",
        "social_insurance",
        "bookkeeping",
        "financial_report",
        "internal",
        "other",
      ],
      office_task_priority: ["low", "med", "high", "urgent"],
      office_task_status: [
        "todo",
        "in_progress",
        "review",
        "done",
        "cancelled",
      ],
      tenant_member_status: ["active", "invited", "disabled"],
      tenant_role: ["owner", "admin", "accountant", "viewer"],
    },
  },
} as const
