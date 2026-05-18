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
          bank_name: string | null
          created_at: string
          currency: string
          gl_account_code: string
          id: string
          name: string
          opening_balance: number
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          account_no?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          gl_account_code?: string
          id?: string
          name: string
          opening_balance?: number
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          account_no?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          gl_account_code?: string
          id?: string
          name?: string
          opening_balance?: number
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          branch_id: string | null
          counterparty: string | null
          created_at: string
          description: string | null
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
      cash_vouchers: {
        Row: {
          amount: number
          branch_id: string | null
          cash_account: string
          cost_center_id: string | null
          counter_account: string
          created_at: string
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
            foreignKeyName: "depreciation_entries_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
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
          checksum_sha256: string | null
          created_at: string
          doc_kind: string
          id: string
          mime_type: string | null
          notes: string | null
          ocr_extracted: Json | null
          ocr_raw: Json | null
          ocr_status: string
          original_filename: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          size_bytes: number | null
          source: string
          storage_bucket: string
          storage_path: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checksum_sha256?: string | null
          created_at?: string
          doc_kind: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          ocr_extracted?: Json | null
          ocr_raw?: Json | null
          ocr_status?: string
          original_filename?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          source?: string
          storage_bucket: string
          storage_path: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checksum_sha256?: string | null
          created_at?: string
          doc_kind?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          ocr_extracted?: Json | null
          ocr_raw?: Json | null
          ocr_status?: string
          original_filename?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          source?: string
          storage_bucket?: string
          storage_path?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      employees: {
        Row: {
          bank_account: string | null
          base_salary: number
          branch_id: string | null
          citizen_id: string | null
          code: string
          created_at: string
          department: string | null
          department_id: string | null
          dependents: number
          end_date: string | null
          full_name: string
          id: string
          insurance_salary: number
          position: string | null
          start_date: string | null
          status: string
          tax_id: string | null
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          bank_account?: string | null
          base_salary?: number
          branch_id?: string | null
          citizen_id?: string | null
          code: string
          created_at?: string
          department?: string | null
          department_id?: string | null
          dependents?: number
          end_date?: string | null
          full_name: string
          id?: string
          insurance_salary?: number
          position?: string | null
          start_date?: string | null
          status?: string
          tax_id?: string | null
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          bank_account?: string | null
          base_salary?: number
          branch_id?: string | null
          citizen_id?: string | null
          code?: string
          created_at?: string
          department?: string | null
          department_id?: string | null
          dependents?: number
          end_date?: string | null
          full_name?: string
          id?: string
          insurance_salary?: number
          position?: string | null
          start_date?: string | null
          status?: string
          tax_id?: string | null
          tenant_id?: string | null
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
      invoice_lines: {
        Row: {
          amount: number | null
          description: string | null
          id: string
          invoice_id: string
          line_type: string
          product_id: string | null
          qty: number | null
          unit_price: number | null
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
          unit_price?: number | null
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
          unit_price?: number | null
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
      payroll_lines: {
        Row: {
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
      payroll_runs: {
        Row: {
          branch_id: string | null
          created_at: string
          department_id: string | null
          id: string
          journal_entry_id: string | null
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
        Relationships: []
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
          barcode: string | null
          category_id: string | null
          code: string
          cogs_account: string
          created_at: string
          id: string
          is_active: boolean
          item_type: string
          max_stock: number
          min_stock: number
          name: string
          notes: string | null
          on_hand: number
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
          barcode?: string | null
          category_id?: string | null
          code: string
          cogs_account?: string
          created_at?: string
          id?: string
          is_active?: boolean
          item_type?: string
          max_stock?: number
          min_stock?: number
          name: string
          notes?: string | null
          on_hand?: number
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
          barcode?: string | null
          category_id?: string | null
          code?: string
          cogs_account?: string
          created_at?: string
          id?: string
          is_active?: boolean
          item_type?: string
          max_stock?: number
          min_stock?: number
          name?: string
          notes?: string | null
          on_hand?: number
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
        Relationships: []
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
            foreignKeyName: "sales_invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          conversion_factor: number
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
          counter_account: string
          created_at: string
          id: string
          journal_entry_id: string | null
          reason: string | null
          tenant_id: string | null
          user_id: string
          voucher_date: string
          voucher_no: string
          voucher_type: string
          warehouse_id: string | null
        }
        Insert: {
          counter_account: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          reason?: string | null
          tenant_id?: string | null
          user_id: string
          voucher_date?: string
          voucher_no: string
          voucher_type: string
          warehouse_id?: string | null
        }
        Update: {
          counter_account?: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          reason?: string | null
          tenant_id?: string | null
          user_id?: string
          voucher_date?: string
          voucher_no?: string
          voucher_type?: string
          warehouse_id?: string | null
        }
        Relationships: [
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
            foreignKeyName: "supplier_payments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      tenants: {
        Row: {
          accounting_standard: string
          address: string | null
          base_currency: string
          billing_address: string | null
          business_reg_date: string | null
          business_reg_no: string | null
          business_reg_place: string | null
          chief_accountant_cert_no: string | null
          chief_accountant_name: string | null
          company_name: string | null
          created_at: string
          email: string | null
          established_date: string | null
          fax: string | null
          fiscal_year_start: number
          id: string
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
          chief_accountant_cert_no?: string | null
          chief_accountant_name?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          established_date?: string | null
          fax?: string | null
          fiscal_year_start?: number
          id?: string
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
          chief_accountant_cert_no?: string | null
          chief_accountant_name?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          established_date?: string | null
          fax?: string | null
          fiscal_year_start?: number
          id?: string
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
      current_tenant_id: { Args: never; Returns: string }
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
      rebuild_account_period_balances: {
        Args: { p_tenant?: string }
        Returns: undefined
      }
      rebuild_monthly_summary: {
        Args: { p_tenant?: string }
        Returns: undefined
      }
      refresh_report_mvs: { Args: { p_tenant?: string }; Returns: undefined }
      transition_document_status: {
        Args: {
          p_id: string
          p_reason?: string
          p_table: string
          p_to_status: string
        }
        Returns: undefined
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
      tenant_member_status: ["active", "invited", "disabled"],
      tenant_role: ["owner", "admin", "accountant", "viewer"],
    },
  },
} as const
