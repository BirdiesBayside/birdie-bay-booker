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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      bay_devices: {
        Row: {
          app_version: string | null
          bay_id: string
          created_at: string
          id: string
          is_online: boolean
          last_seen: string | null
          updated_at: string
        }
        Insert: {
          app_version?: string | null
          bay_id: string
          created_at?: string
          id?: string
          is_online?: boolean
          last_seen?: string | null
          updated_at?: string
        }
        Update: {
          app_version?: string | null
          bay_id?: string
          created_at?: string
          id?: string
          is_online?: boolean
          last_seen?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bay_devices_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: true
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
        ]
      }
      bays: {
        Row: {
          bay_number: number
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          bay_number: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          bay_number?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          bay_id: string
          booking_date: string
          created_at: string
          duration_hours: number
          end_time: string
          hourly_rate: number
          id: string
          player_count: number
          start_time: string
          status: string
          total_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bay_id: string
          booking_date: string
          created_at?: string
          duration_hours: number
          end_time: string
          hourly_rate: number
          id?: string
          player_count?: number
          start_time: string
          status?: string
          total_price: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bay_id?: string
          booking_date?: string
          created_at?: string
          duration_hours?: number
          end_time?: string
          hourly_rate?: number
          id?: string
          player_count?: number
          start_time?: string
          status?: string
          total_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          membership_tier: Database["public"]["Enums"]["membership_tier"]
          phone: string | null
          sgt_user_id: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          first_name: string
          id?: string
          last_name: string
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          phone?: string | null
          sgt_user_id?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          phone?: string | null
          sgt_user_id?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sgt_members: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_active: number
          user_country_code: string | null
          user_email: string | null
          user_has_avatar: string | null
          user_id: number
          user_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_active?: number
          user_country_code?: string | null
          user_email?: string | null
          user_has_avatar?: string | null
          user_id: number
          user_name: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_active?: number
          user_country_code?: string | null
          user_email?: string | null
          user_has_avatar?: string | null
          user_id?: number
          user_name?: string
        }
        Relationships: []
      }
      sgt_scorecards: {
        Row: {
          course_name: string | null
          created_at: string
          hcp_index: number | null
          hole_data: Json | null
          id: string
          in_gross: number | null
          in_net: number | null
          out_gross: number | null
          out_net: number | null
          player_id: number
          player_name: string
          rating: number | null
          round: number | null
          slope: number | null
          teetype: string | null
          to_par_gross: number | null
          to_par_net: number | null
          total_gross: number | null
          total_net: number | null
          tournament_id: number
          updated_at: string
        }
        Insert: {
          course_name?: string | null
          created_at?: string
          hcp_index?: number | null
          hole_data?: Json | null
          id?: string
          in_gross?: number | null
          in_net?: number | null
          out_gross?: number | null
          out_net?: number | null
          player_id: number
          player_name: string
          rating?: number | null
          round?: number | null
          slope?: number | null
          teetype?: string | null
          to_par_gross?: number | null
          to_par_net?: number | null
          total_gross?: number | null
          total_net?: number | null
          tournament_id: number
          updated_at?: string
        }
        Update: {
          course_name?: string | null
          created_at?: string
          hcp_index?: number | null
          hole_data?: Json | null
          id?: string
          in_gross?: number | null
          in_net?: number | null
          out_gross?: number | null
          out_net?: number | null
          player_id?: number
          player_name?: string
          rating?: number | null
          round?: number | null
          slope?: number | null
          teetype?: string | null
          to_par_gross?: number | null
          to_par_net?: number | null
          total_gross?: number | null
          total_net?: number | null
          tournament_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      sgt_tour_members: {
        Row: {
          created_at: string
          custom_hcp: number | null
          hcp_index: number | null
          id: string
          tour_id: number
          updated_at: string
          user_id: number
          user_name: string | null
        }
        Insert: {
          created_at?: string
          custom_hcp?: number | null
          hcp_index?: number | null
          id?: string
          tour_id: number
          updated_at?: string
          user_id: number
          user_name?: string | null
        }
        Update: {
          created_at?: string
          custom_hcp?: number | null
          hcp_index?: number | null
          id?: string
          tour_id?: number
          updated_at?: string
          user_id?: number
          user_name?: string | null
        }
        Relationships: []
      }
      sgt_tour_standings: {
        Row: {
          country_code: string | null
          created_at: string
          events: number | null
          first: number | null
          gross_or_net: string
          hcp: number | null
          id: string
          points: number | null
          position: number
          top10: number | null
          top5: number | null
          tour_id: number
          updated_at: string
          user_has_avatar: string | null
          user_name: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          events?: number | null
          first?: number | null
          gross_or_net?: string
          hcp?: number | null
          id?: string
          points?: number | null
          position: number
          top10?: number | null
          top5?: number | null
          tour_id: number
          updated_at?: string
          user_has_avatar?: string | null
          user_name: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          events?: number | null
          first?: number | null
          gross_or_net?: string
          hcp?: number | null
          id?: string
          points?: number | null
          position?: number
          top10?: number | null
          top5?: number | null
          tour_id?: number
          updated_at?: string
          user_has_avatar?: string | null
          user_name?: string
        }
        Relationships: []
      }
      sgt_tournaments: {
        Row: {
          course_name: string | null
          created_at: string
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: string | null
          tour_id: number
          tournament_id: number
          updated_at: string
        }
        Insert: {
          course_name?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string | null
          tour_id: number
          tournament_id: number
          updated_at?: string
        }
        Update: {
          course_name?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string | null
          tour_id?: number
          tournament_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      sgt_tours: {
        Row: {
          active: number
          created_at: string
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          team_tour: number | null
          tour_id: number
          updated_at: string
        }
        Insert: {
          active?: number
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          team_tour?: number | null
          tour_id: number
          updated_at?: string
        }
        Update: {
          active?: number
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          team_tour?: number | null
          tour_id?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      booking_availability: {
        Row: {
          bay_id: string | null
          booking_date: string | null
          end_time: string | null
          start_time: string | null
        }
        Insert: {
          bay_id?: string | null
          booking_date?: string | null
          end_time?: string | null
          start_time?: string | null
        }
        Update: {
          bay_id?: string | null
          booking_date?: string | null
          end_time?: string | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      membership_tier: "visitor" | "par" | "birdie" | "eagle" | "albatross"
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
      membership_tier: ["visitor", "par", "birdie", "eagle", "albatross"],
    },
  },
} as const
