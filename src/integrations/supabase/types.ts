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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      fixtures: {
        Row: {
          away_team: string
          created_at: string | null
          home_team: string
          id: string
          league_code: string
          league_name: string
          match_date: string
          match_time: string | null
          referee: string | null
        }
        Insert: {
          away_team: string
          created_at?: string | null
          home_team: string
          id?: string
          league_code: string
          league_name: string
          match_date: string
          match_time?: string | null
          referee?: string | null
        }
        Update: {
          away_team?: string
          created_at?: string | null
          home_team?: string
          id?: string
          league_code?: string
          league_name?: string
          match_date?: string
          match_time?: string | null
          referee?: string | null
        }
        Relationships: []
      }
      matches: {
        Row: {
          away_corners: number | null
          away_fouls: number | null
          away_reds: number | null
          away_shots: number | null
          away_shots_target: number | null
          away_team: string
          away_yellows: number | null
          created_at: string | null
          ft_away_goals: number | null
          ft_home_goals: number | null
          ft_result: string | null
          home_corners: number | null
          home_fouls: number | null
          home_reds: number | null
          home_shots: number | null
          home_shots_target: number | null
          home_team: string
          home_yellows: number | null
          ht_away_goals: number | null
          ht_home_goals: number | null
          ht_result: string | null
          id: string
          league_code: string
          league_name: string
          match_date: string
          referee: string | null
          season: string
        }
        Insert: {
          away_corners?: number | null
          away_fouls?: number | null
          away_reds?: number | null
          away_shots?: number | null
          away_shots_target?: number | null
          away_team: string
          away_yellows?: number | null
          created_at?: string | null
          ft_away_goals?: number | null
          ft_home_goals?: number | null
          ft_result?: string | null
          home_corners?: number | null
          home_fouls?: number | null
          home_reds?: number | null
          home_shots?: number | null
          home_shots_target?: number | null
          home_team: string
          home_yellows?: number | null
          ht_away_goals?: number | null
          ht_home_goals?: number | null
          ht_result?: string | null
          id?: string
          league_code: string
          league_name: string
          match_date: string
          referee?: string | null
          season: string
        }
        Update: {
          away_corners?: number | null
          away_fouls?: number | null
          away_reds?: number | null
          away_shots?: number | null
          away_shots_target?: number | null
          away_team?: string
          away_yellows?: number | null
          created_at?: string | null
          ft_away_goals?: number | null
          ft_home_goals?: number | null
          ft_result?: string | null
          home_corners?: number | null
          home_fouls?: number | null
          home_reds?: number | null
          home_shots?: number | null
          home_shots_target?: number | null
          home_team?: string
          home_yellows?: number | null
          ht_away_goals?: number | null
          ht_home_goals?: number | null
          ht_result?: string | null
          id?: string
          league_code?: string
          league_name?: string
          match_date?: string
          referee?: string | null
          season?: string
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
