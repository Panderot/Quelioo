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
      card_progress: {
        Row: {
          box: number
          card_id: string
          due: string
          introduced_at: string | null
          lapses: number
          last_reviewed_at: string | null
          reviews: number
          updated_at: string
          user_id: string
        }
        Insert: {
          box?: number
          card_id: string
          due?: string
          introduced_at?: string | null
          lapses?: number
          last_reviewed_at?: string | null
          reviews?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          box?: number
          card_id?: string
          due?: string
          introduced_at?: string | null
          lapses?: number
          last_reviewed_at?: string | null
          reviews?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_progress_card_id_user_id_fkey"
            columns: ["card_id", "user_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      cards: {
        Row: {
          back: string
          created_at: string
          deck_id: string
          front: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          back?: string
          created_at?: string
          deck_id: string
          front?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          back?: string
          created_at?: string
          deck_id?: string
          front?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_deck_id_user_id_fkey"
            columns: ["deck_id", "user_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      decks: {
        Row: {
          created_at: string
          description: string
          id: string
          language: string
          name: string
          new_per_day: number
          source: string
          source_ref: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          language?: string
          name?: string
          new_per_day?: number
          source?: string
          source_ref?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          language?: string
          name?: string
          new_per_day?: number
          source?: string
          source_ref?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lesson_plans: {
        Row: {
          created_at: string
          episodes: Json
          key: string
          key_points: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          episodes: Json
          key: string
          key_points: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          episodes?: Json
          key?: string
          key_points?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lesson_segments: {
        Row: {
          audio_path: string
          created_at: string
          duration_seconds: number
          key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_path: string
          created_at?: string
          duration_seconds?: number
          key: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          audio_path?: string
          created_at?: string
          duration_seconds?: number
          key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lessons: {
        Row: {
          created_at: string
          episodes: Json
          id: string
          key_points: Json
          options: Json
          plan_cost_usd: number
          schema_version: number
          source_hash: string
          source_kind: string
          source_label: string
          source_text: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          episodes: Json
          id?: string
          key_points: Json
          options: Json
          plan_cost_usd?: number
          schema_version?: number
          source_hash?: string
          source_kind?: string
          source_label?: string
          source_text?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          episodes?: Json
          id?: string
          key_points?: Json
          options?: Json
          plan_cost_usd?: number
          schema_version?: number
          source_hash?: string
          source_kind?: string
          source_label?: string
          source_text?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          role: string
          ui_language: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
          role?: string
          ui_language?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          role?: string
          ui_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      quizzes: {
        Row: {
          coverage_scope: string | null
          created_at: string
          difficulty: string
          focus_parts_count: number | null
          id: string
          include_explanations: boolean | null
          include_hints: boolean | null
          options_count: string | null
          output_language: string | null
          question_count: string
          question_type: string
          quiz: Json
          results: Json | null
          shuffle_options: boolean | null
          source: string
          source_hash: string | null
          source_text: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          coverage_scope?: string | null
          created_at?: string
          difficulty?: string
          focus_parts_count?: number | null
          id?: string
          include_explanations?: boolean | null
          include_hints?: boolean | null
          options_count?: string | null
          output_language?: string | null
          question_count?: string
          question_type?: string
          quiz: Json
          results?: Json | null
          shuffle_options?: boolean | null
          source?: string
          source_hash?: string | null
          source_text?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          coverage_scope?: string | null
          created_at?: string
          difficulty?: string
          focus_parts_count?: number | null
          id?: string
          include_explanations?: boolean | null
          include_hints?: boolean | null
          options_count?: string | null
          output_language?: string | null
          question_count?: string
          question_type?: string
          quiz?: Json
          results?: Json | null
          shuffle_options?: boolean | null
          source?: string
          source_hash?: string | null
          source_text?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      solves: {
        Row: {
          created_at: string
          extras: Json
          id: string
          language: string
          result: Json
          schema_version: number
          thumbnail_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extras?: Json
          id?: string
          language?: string
          result: Json
          schema_version?: number
          thumbnail_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          extras?: Json
          id?: string
          language?: string
          result?: Json
          schema_version?: number
          thumbnail_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      songs: {
        Row: {
          audio_path: string | null
          coverage: Json | null
          created_at: string
          demo: boolean
          duration_seconds: number
          fact_check_passed: boolean
          id: string
          lyrics: string
          mime_type: string
          provider: string
          quiz_id: string
          quiz_title: string
          series_part: number | null
          style: string
          title: string
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_path?: string | null
          coverage?: Json | null
          created_at?: string
          demo?: boolean
          duration_seconds?: number
          fact_check_passed?: boolean
          id?: string
          lyrics?: string
          mime_type: string
          provider: string
          quiz_id: string
          quiz_title?: string
          series_part?: number | null
          style: string
          title?: string
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          audio_path?: string | null
          coverage?: Json | null
          created_at?: string
          demo?: boolean
          duration_seconds?: number
          fact_check_passed?: boolean
          id?: string
          lyrics?: string
          mime_type?: string
          provider?: string
          quiz_id?: string
          quiz_title?: string
          series_part?: number | null
          style?: string
          title?: string
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          plan: string
          provider: string | null
          provider_customer_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          plan?: string
          provider?: string | null
          provider_customer_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          plan?: string
          provider?: string | null
          provider_customer_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          cost_usd: number
          created_at: string
          feature: string
          id: number
          input_tokens: number
          model: string
          output_tokens: number
          provider: string
          user_id: string
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          feature: string
          id?: never
          input_tokens?: number
          model?: string
          output_tokens?: number
          provider?: string
          user_id: string
        }
        Update: {
          cost_usd?: number
          created_at?: string
          feature?: string
          id?: never
          input_tokens?: number
          model?: string
          output_tokens?: number
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      merge_solve_extras: {
        Args: { p_id: string; p_key: string; p_value: Json }
        Returns: undefined
      }
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
    Enums: {},
  },
} as const
