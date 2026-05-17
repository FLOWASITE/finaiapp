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
          user_id: string
        }
        Insert: {
          chosen_index?: number | null
          created_at?: string
          feedback?: string | null
          id?: string
          invoice_id: string
          suggestions: Json
          user_id: string
        }
        Update: {
          chosen_index?: number | null
          created_at?: string
          feedback?: string | null
          id?: string
          invoice_id?: string
          suggestions?: Json
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
      chart_of_accounts: {
        Row: {
          code: string
          name: string
          parent_code: string | null
          type: string
        }
        Insert: {
          code: string
          name: string
          parent_code?: string | null
          type: string
        }
        Update: {
          code?: string
          name?: string
          parent_code?: string | null
          type?: string
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          amount: number | null
          description: string | null
          id: string
          invoice_id: string
          qty: number | null
          unit_price: number | null
          vat_rate: number | null
        }
        Insert: {
          amount?: number | null
          description?: string | null
          id?: string
          invoice_id: string
          qty?: number | null
          unit_price?: number | null
          vat_rate?: number | null
        }
        Update: {
          amount?: number | null
          description?: string | null
          id?: string
          invoice_id?: string
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
          file_path: string
          id: string
          invoice_no: string | null
          issue_date: string | null
          notes: string | null
          raw_ocr: Json | null
          status: string
          subtotal: number | null
          supplier_id: string | null
          supplier_name: string | null
          supplier_tax_id: string | null
          total: number | null
          updated_at: string
          user_id: string
          vat_amount: number | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          file_path: string
          id?: string
          invoice_no?: string | null
          issue_date?: string | null
          notes?: string | null
          raw_ocr?: Json | null
          status?: string
          subtotal?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_tax_id?: string | null
          total?: number | null
          updated_at?: string
          user_id: string
          vat_amount?: number | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          file_path?: string
          id?: string
          invoice_no?: string | null
          issue_date?: string | null
          notes?: string | null
          raw_ocr?: Json | null
          status?: string
          subtotal?: number | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_tax_id?: string | null
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
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          invoice_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entry_date?: string
          id?: string
          invoice_id?: string | null
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
      profiles: {
        Row: {
          accounting_standard: string
          company_name: string | null
          created_at: string
          email: string | null
          id: string
          tax_id: string | null
        }
        Insert: {
          accounting_standard?: string
          company_name?: string | null
          created_at?: string
          email?: string | null
          id: string
          tax_id?: string | null
        }
        Update: {
          accounting_standard?: string
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          tax_id?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          risk_flag: string | null
          tax_id: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          risk_flag?: string | null
          tax_id?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          risk_flag?: string | null
          tax_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
