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
        ]
      }
      cash_vouchers: {
        Row: {
          amount: number
          cash_account: string
          counter_account: string
          created_at: string
          id: string
          journal_entry_id: string | null
          party_name: string | null
          reason: string | null
          tenant_id: string | null
          user_id: string
          voucher_date: string
          voucher_no: string
          voucher_type: string
        }
        Insert: {
          amount: number
          cash_account?: string
          counter_account: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          party_name?: string | null
          reason?: string | null
          tenant_id?: string | null
          user_id: string
          voucher_date?: string
          voucher_no: string
          voucher_type: string
        }
        Update: {
          amount?: number
          cash_account?: string
          counter_account?: string
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          party_name?: string | null
          reason?: string | null
          tenant_id?: string | null
          user_id?: string
          voucher_date?: string
          voucher_no?: string
          voucher_type?: string
        }
        Relationships: []
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
      customer_receipts: {
        Row: {
          amount: number
          created_at: string
          customer_id: string | null
          customer_name: string | null
          id: string
          invoice_id: string | null
          journal_entry_id: string | null
          method: string
          notes: string | null
          pay_date: string
          reference: string | null
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          invoice_id?: string | null
          journal_entry_id?: string | null
          method?: string
          notes?: string | null
          pay_date?: string
          reference?: string | null
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          invoice_id?: string | null
          journal_entry_id?: string | null
          method?: string
          notes?: string | null
          pay_date?: string
          reference?: string | null
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_receipts_invoice_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          code: string | null
          contact_person: string | null
          created_at: string
          currency: string
          email: string | null
          email_cc: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          opening_balance: number
          payment_terms_days: number
          phone: string | null
          tax_id: string | null
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          contact_person?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          email_cc?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          tax_id?: string | null
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          code?: string | null
          contact_person?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          email_cc?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          opening_balance?: number
          payment_terms_days?: number
          phone?: string | null
          tax_id?: string | null
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
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
      employees: {
        Row: {
          bank_account: string | null
          base_salary: number
          citizen_id: string | null
          code: string
          created_at: string
          department: string | null
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
          citizen_id?: string | null
          code: string
          created_at?: string
          department?: string | null
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
          citizen_id?: string | null
          code?: string
          created_at?: string
          department?: string | null
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
        Relationships: []
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
      fixed_assets: {
        Row: {
          accumulated_account: string
          asset_account: string
          code: string
          cost: number
          created_at: string
          expense_account: string
          id: string
          method: string
          name: string
          notes: string | null
          salvage_value: number
          start_date: string
          status: string
          tenant_id: string | null
          useful_life_months: number
          user_id: string
        }
        Insert: {
          accumulated_account?: string
          asset_account?: string
          code: string
          cost: number
          created_at?: string
          expense_account?: string
          id?: string
          method?: string
          name: string
          notes?: string | null
          salvage_value?: number
          start_date: string
          status?: string
          tenant_id?: string | null
          useful_life_months: number
          user_id: string
        }
        Update: {
          accumulated_account?: string
          asset_account?: string
          code?: string
          cost?: number
          created_at?: string
          expense_account?: string
          id?: string
          method?: string
          name?: string
          notes?: string | null
          salvage_value?: number
          start_date?: string
          status?: string
          tenant_id?: string | null
          useful_life_months?: number
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
          created_at: string
          currency: string | null
          expense_account: string | null
          file_path: string
          id: string
          invoice_no: string | null
          issue_date: string | null
          notes: string | null
          payment_status: string
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
        }
        Insert: {
          created_at?: string
          currency?: string | null
          expense_account?: string | null
          file_path: string
          id?: string
          invoice_no?: string | null
          issue_date?: string | null
          notes?: string | null
          payment_status?: string
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
        }
        Update: {
          created_at?: string
          currency?: string | null
          expense_account?: string | null
          file_path?: string
          id?: string
          invoice_no?: string | null
          issue_date?: string | null
          notes?: string | null
          payment_status?: string
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
      journal_entries: {
        Row: {
          created_at: string
          description: string | null
          entry_date: string
          id: string
          invoice_id: string | null
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          invoice_id?: string | null
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          invoice_id?: string | null
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_code: string
          credit: number
          debit: number
          entry_id: string
          id: string
          line_order: number
        }
        Insert: {
          account_code: string
          credit?: number
          debit?: number
          entry_id: string
          id?: string
          line_order?: number
        }
        Update: {
          account_code?: string
          credit?: number
          debit?: number
          entry_id?: string
          id?: string
          line_order?: number
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
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
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
          created_at: string
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
          created_at?: string
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
          created_at?: string
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
        Relationships: []
      }
      period_locks: {
        Row: {
          id: string
          locked_at: string
          month: number
          note: string | null
          tenant_id: string | null
          user_id: string
          year: number
        }
        Insert: {
          id?: string
          locked_at?: string
          month: number
          note?: string | null
          tenant_id?: string | null
          user_id: string
          year: number
        }
        Update: {
          id?: string
          locked_at?: string
          month?: number
          note?: string | null
          tenant_id?: string | null
          user_id?: string
          year?: number
        }
        Relationships: []
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
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          code: string
          cogs_account: string
          created_at: string
          id: string
          is_active: boolean
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
          bank_account: string | null
          base_currency: string
          chief_accountant_name: string | null
          company_name: string | null
          created_at: string
          email: string | null
          fiscal_year_start: number
          id: string
          legal_rep_name: string | null
          logo_url: string | null
          phone: string | null
          preparer_name: string | null
          signature_url: string | null
          signer_name: string | null
          stamp_url: string | null
          tax_id: string | null
        }
        Insert: {
          accounting_standard?: string
          active_tenant_id?: string | null
          address?: string | null
          bank_account?: string | null
          base_currency?: string
          chief_accountant_name?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          fiscal_year_start?: number
          id: string
          legal_rep_name?: string | null
          logo_url?: string | null
          phone?: string | null
          preparer_name?: string | null
          signature_url?: string | null
          signer_name?: string | null
          stamp_url?: string | null
          tax_id?: string | null
        }
        Update: {
          accounting_standard?: string
          active_tenant_id?: string | null
          address?: string | null
          bank_account?: string | null
          base_currency?: string
          chief_accountant_name?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          fiscal_year_start?: number
          id?: string
          legal_rep_name?: string | null
          logo_url?: string | null
          phone?: string | null
          preparer_name?: string | null
          signature_url?: string | null
          signer_name?: string | null
          stamp_url?: string | null
          tax_id?: string | null
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
          created_at: string
          currency: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_tax_id: string | null
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
        }
        Insert: {
          billing_address?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_tax_id?: string | null
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
        }
        Update: {
          billing_address?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_tax_id?: string | null
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
      stock_movements: {
        Row: {
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
          unit_cost: number
          user_id: string
        }
        Insert: {
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
          unit_cost?: number
          user_id: string
        }
        Update: {
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
          unit_cost?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
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
        }
        Relationships: []
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string | null
          journal_entry_id: string | null
          method: string
          pay_date: string
          reference: string | null
          supplier_id: string | null
          supplier_name: string | null
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          journal_entry_id?: string | null
          method?: string
          pay_date?: string
          reference?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          journal_entry_id?: string | null
          method?: string
          pay_date?: string
          reference?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          payment_terms_days: number
          phone: string | null
          risk_flag: string | null
          tax_id: string | null
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          payment_terms_days?: number
          phone?: string | null
          risk_flag?: string | null
          tax_id?: string | null
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          payment_terms_days?: number
          phone?: string | null
          risk_flag?: string | null
          tax_id?: string | null
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tenant_id: { Args: never; Returns: string }
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
      is_period_locked: {
        Args: { _date: string; _user_id: string }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
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
