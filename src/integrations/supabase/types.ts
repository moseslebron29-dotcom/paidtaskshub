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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activation_payments: {
        Row: {
          amount: number
          checkout_request_id: string | null
          created_at: string
          id: string
          merchant_request_id: string | null
          mpesa_receipt: string | null
          paid_at: string | null
          phone: string
          result_description: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          checkout_request_id?: string | null
          created_at?: string
          id?: string
          merchant_request_id?: string | null
          mpesa_receipt?: string | null
          paid_at?: string | null
          phone: string
          result_description?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          checkout_request_id?: string | null
          created_at?: string
          id?: string
          merchant_request_id?: string | null
          mpesa_receipt?: string | null
          paid_at?: string | null
          phone?: string
          result_description?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activation_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          activation_fee: number
          announcement: string
          id: number
          min_withdrawal: number
          referral_commission: number
          support_email: string
          support_phone: string
          updated_at: string
          withdrawal_fee: number
          withdrawals_enabled: boolean
        }
        Insert: {
          activation_fee?: number
          announcement?: string
          id?: number
          min_withdrawal?: number
          referral_commission?: number
          support_email?: string
          support_phone?: string
          updated_at?: string
          withdrawal_fee?: number
          withdrawals_enabled?: boolean
        }
        Update: {
          activation_fee?: number
          announcement?: string
          id?: number
          min_withdrawal?: number
          referral_commission?: number
          support_email?: string
          support_phone?: string
          updated_at?: string
          withdrawal_fee?: number
          withdrawals_enabled?: boolean
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          detail: string | null
          id: number
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          detail?: string | null
          id?: number
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          detail?: string | null
          id?: number
        }
        Relationships: []
      }
      complaints: {
        Row: {
          admin_reply: string | null
          created_at: string
          id: string
          message: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_reply?: string | null
          created_at?: string
          id?: string
          message: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_reply?: string | null
          created_at?: string
          id?: string
          message?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger: {
        Row: {
          amount: number
          created_at: string
          id: number
          note: string | null
          ref: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: number
          note?: string | null
          ref?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: number
          note?: string | null
          ref?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activated: boolean
          activated_at: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string
          referral_code: string
          referred_by: string | null
          status: string
        }
        Insert: {
          activated?: boolean
          activated_at?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id: string
          phone?: string
          referral_code: string
          referred_by?: string | null
          status?: string
        }
        Update: {
          activated?: boolean
          activated_at?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string
          referral_code?: string
          referred_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string
          created_at: string
          display_name: string
          id: string
          is_sample: boolean
          publish_consent: boolean
          rating: number
          status: string
          user_id: string | null
          verified: boolean
        }
        Insert: {
          body: string
          created_at?: string
          display_name: string
          id?: string
          is_sample?: boolean
          publish_consent?: boolean
          rating: number
          status?: string
          user_id?: string | null
          verified?: boolean
        }
        Update: {
          body?: string
          created_at?: string
          display_name?: string
          id?: string
          is_sample?: boolean
          publish_consent?: boolean
          rating?: number
          status?: string
          user_id?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_submissions: {
        Row: {
          admin_note: string | null
          id: string
          proof_path: string | null
          proof_text: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reward: number | null
          started_at: string
          status: string
          submitted_at: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          id?: string
          proof_path?: string | null
          proof_text?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward?: number | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          id?: string
          proof_path?: string | null
          proof_text?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward?: number | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          active: boolean
          category: string
          created_at: string
          description: string
          duration_minutes: number | null
          id: string
          instructions: string
          max_completions: number | null
          one_per_user: boolean
          requires_proof: boolean
          reward: number | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          description?: string
          duration_minutes?: number | null
          id?: string
          instructions?: string
          max_completions?: number | null
          one_per_user?: boolean
          requires_proof?: boolean
          reward?: number | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string
          duration_minutes?: number | null
          id?: string
          instructions?: string
          max_completions?: number | null
          one_per_user?: boolean
          requires_proof?: boolean
          reward?: number | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          fee: number
          id: string
          mpesa_receipt: string | null
          phone: string
          reference: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          created_at?: string
          fee?: number
          id?: string
          mpesa_receipt?: string | null
          phone: string
          reference?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          fee?: number
          id?: string
          mpesa_receipt?: string | null
          phone?: string
          reference?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_from_payment: {
        Args: { _paid_amount: number; _payment: string; _receipt: string }
        Returns: boolean
      }
      admin_adjust_wallet: {
        Args: { _amount: number; _note: string; _user: string }
        Returns: undefined
      }
      admin_mark_under_review: {
        Args: { _submission: string }
        Returns: undefined
      }
      admin_review_submission: {
        Args: { _approve: boolean; _note: string; _submission: string }
        Returns: undefined
      }
      admin_set_activation: {
        Args: { _activated: boolean; _user: string }
        Returns: undefined
      }
      admin_stats: { Args: never; Returns: Json }
      admin_update_withdrawal: {
        Args: { _id: string; _note: string; _receipt: string; _status: string }
        Returns: undefined
      }
      gen_referral_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      my_wallet: { Args: never; Returns: Json }
      platform_stats: { Args: never; Returns: Json }
      request_withdrawal: {
        Args: { _amount: number; _phone: string }
        Returns: string
      }
      require_admin: { Args: never; Returns: undefined }
      start_task: { Args: { _task: string }; Returns: string }
      submit_review: {
        Args: { _body: string; _consent: boolean; _rating: number }
        Returns: undefined
      }
      submit_task: {
        Args: { _proof_path: string; _proof_text: string; _submission: string }
        Returns: undefined
      }
      wallet_balance: { Args: { _user: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const
