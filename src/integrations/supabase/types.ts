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
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          members_only: boolean | null
          source_id: string | null
          source_type: string | null
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          members_only?: boolean | null
          source_id?: string | null
          source_type?: string | null
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          members_only?: boolean | null
          source_id?: string | null
          source_type?: string | null
          title?: string
        }
        Relationships: []
      }
      bay_blocks: {
        Row: {
          bay_id: string
          block_date: string
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          reason: string | null
          start_time: string
        }
        Insert: {
          bay_id: string
          block_date: string
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          reason?: string | null
          start_time: string
        }
        Update: {
          bay_id?: string
          block_date?: string
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          reason?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "bay_blocks_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
        ]
      }
      bay_commands: {
        Row: {
          bay_number: number
          command: string
          created_at: string
          created_by: string | null
          executed_at: string | null
          id: string
          status: string
        }
        Insert: {
          bay_number: number
          command: string
          created_at?: string
          created_by?: string | null
          executed_at?: string | null
          id?: string
          status?: string
        }
        Update: {
          bay_number?: number
          command?: string
          created_at?: string
          created_by?: string | null
          executed_at?: string | null
          id?: string
          status?: string
        }
        Relationships: []
      }
      bay_controller_logs: {
        Row: {
          app_version: string | null
          bay_number: number
          booking_id: string | null
          created_at: string
          details: Json | null
          event_level: string
          event_type: string
          id: string
          message: string
        }
        Insert: {
          app_version?: string | null
          bay_number: number
          booking_id?: string | null
          created_at?: string
          details?: Json | null
          event_level?: string
          event_type: string
          id?: string
          message: string
        }
        Update: {
          app_version?: string | null
          bay_number?: number
          booking_id?: string | null
          created_at?: string
          details?: Json | null
          event_level?: string
          event_type?: string
          id?: string
          message?: string
        }
        Relationships: []
      }
      bay_devices: {
        Row: {
          app_version: string | null
          bay_id: string
          control_mode: string
          created_at: string
          id: string
          is_online: boolean
          last_seen: string | null
          plug_status: string | null
          updated_at: string
        }
        Insert: {
          app_version?: string | null
          bay_id: string
          control_mode?: string
          created_at?: string
          id?: string
          is_online?: boolean
          last_seen?: string | null
          plug_status?: string | null
          updated_at?: string
        }
        Update: {
          app_version?: string | null
          bay_id?: string
          control_mode?: string
          created_at?: string
          id?: string
          is_online?: boolean
          last_seen?: string | null
          plug_status?: string | null
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
      bay_orders: {
        Row: {
          bay_number: number
          created_at: string
          id: string
          items: Json
          processed_at: string | null
          processed_by: string | null
          status: string
          total: number
        }
        Insert: {
          bay_number: number
          created_at?: string
          id?: string
          items: Json
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          total: number
        }
        Update: {
          bay_number?: number
          created_at?: string
          id?: string
          items?: Json
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          total?: number
        }
        Relationships: []
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
          payment_method: string | null
          player_count: number
          start_time: string
          status: string
          stripe_payment_intent_id: string | null
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
          payment_method?: string | null
          player_count?: number
          start_time: string
          status?: string
          stripe_payment_intent_id?: string | null
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
          payment_method?: string | null
          player_count?: number
          start_time?: string
          status?: string
          stripe_payment_intent_id?: string | null
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
      clubhouse_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubhouse_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "clubhouse_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      clubhouse_posts: {
        Row: {
          content: string
          created_at: string
          id: string
          image_url: string | null
          title: string
          updated_at: string
          upvote_count: number
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          title: string
          updated_at?: string
          upvote_count?: number
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          title?: string
          updated_at?: string
          upvote_count?: number
          user_id?: string
        }
        Relationships: []
      }
      clubhouse_upvotes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubhouse_upvotes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "clubhouse_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          created_at: string
          description: string | null
          html_content: string | null
          id: string
          is_active: boolean
          name: string
          subject: string | null
          template_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          html_content?: string | null
          id?: string
          is_active?: boolean
          name: string
          subject?: string | null
          template_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          html_content?: string | null
          id?: string
          is_active?: boolean
          name?: string
          subject?: string | null
          template_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      gift_cards: {
        Row: {
          amount: number
          created_at: string
          id: string
          issued_at: string
          issued_by: string | null
          recipient_email: string
          redeemed_at: string | null
          redeemed_by_user_id: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          recipient_email: string
          redeemed_at?: string | null
          redeemed_by_user_id?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          recipient_email?: string
          redeemed_at?: string | null
          redeemed_by_user_id?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_campaigns: {
        Row: {
          clicks: number | null
          created_at: string
          created_by: string | null
          html_content: string
          id: string
          name: string
          opens: number | null
          recipient_count: number | null
          recipient_filter: Json | null
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          clicks?: number | null
          created_at?: string
          created_by?: string | null
          html_content: string
          id?: string
          name: string
          opens?: number | null
          recipient_count?: number | null
          recipient_filter?: Json | null
          sent_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          clicks?: number | null
          created_at?: string
          created_by?: string | null
          html_content?: string
          id?: string
          name?: string
          opens?: number | null
          recipient_count?: number | null
          recipient_filter?: Json | null
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_templates: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          html_content: string
          id: string
          is_active: boolean | null
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          html_content: string
          id?: string
          is_active?: boolean | null
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          html_content?: string
          id?: string
          is_active?: boolean | null
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_unsubscribes: {
        Row: {
          email: string
          id: string
          reason: string | null
          unsubscribed_at: string
        }
        Insert: {
          email: string
          id?: string
          reason?: string | null
          unsubscribed_at?: string
        }
        Update: {
          email?: string
          id?: string
          reason?: string | null
          unsubscribed_at?: string
        }
        Relationships: []
      }
      membership_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          paid_at: string
          period_end: string | null
          period_start: string | null
          stripe_customer_id: string
          stripe_invoice_id: string
          tier: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          paid_at?: string
          period_end?: string | null
          period_start?: string | null
          stripe_customer_id: string
          stripe_invoice_id: string
          tier: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          paid_at?: string
          period_end?: string | null
          period_start?: string | null
          stripe_customer_id?: string
          stripe_invoice_id?: string
          tier?: string
          user_id?: string
        }
        Relationships: []
      }
      pos_products: {
        Row: {
          created_at: string
          display_order: number | null
          family: string | null
          id: string
          is_active: boolean
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          family?: string | null
          id?: string
          is_active?: boolean
          name: string
          price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          family?: string | null
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_transactions: {
        Row: {
          booking_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          items: Json
          payment_method: string
          status: string
          stripe_payment_intent_id: string | null
          subtotal: number
          total: number
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          items: Json
          payment_method: string
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal: number
          total: number
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          items?: Json
          payment_method?: string
          status?: string
          stripe_payment_intent_id?: string | null
          subtotal?: number
          total?: number
        }
        Relationships: []
      }
      pricing_config: {
        Row: {
          created_at: string
          display_name: string
          display_order: number
          hourly_rate: number
          id: string
          is_subscription: boolean
          stripe_price_id: string | null
          stripe_product_id: string | null
          tier: string
          updated_at: string
          weekly_subscription_price: number | null
        }
        Insert: {
          created_at?: string
          display_name: string
          display_order?: number
          hourly_rate: number
          id?: string
          is_subscription?: boolean
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          tier: string
          updated_at?: string
          weekly_subscription_price?: number | null
        }
        Update: {
          created_at?: string
          display_name?: string
          display_order?: number
          hourly_rate?: number
          id?: string
          is_subscription?: boolean
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          tier?: string
          updated_at?: string
          weekly_subscription_price?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          custom_billing: boolean
          custom_hourly_rate: number | null
          custom_segment: string | null
          deposit_balance: number
          display_name: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          marketing_opt_out: boolean | null
          membership_on_hold: boolean
          membership_tier: Database["public"]["Enums"]["membership_tier"]
          phone: string | null
          sgt_user_id: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_billing?: boolean
          custom_hourly_rate?: number | null
          custom_segment?: string | null
          deposit_balance?: number
          display_name?: string | null
          email: string
          first_name: string
          id?: string
          last_name: string
          marketing_opt_out?: boolean | null
          membership_on_hold?: boolean
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          phone?: string | null
          sgt_user_id?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom_billing?: boolean
          custom_hourly_rate?: number | null
          custom_segment?: string | null
          deposit_balance?: number
          display_name?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          marketing_opt_out?: boolean | null
          membership_on_hold?: boolean
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          phone?: string | null
          sgt_user_id?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sgt_api_config: {
        Row: {
          api_key: string
          created_at: string
          expires_at: string
          id: string
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          expires_at: string
          id?: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          expires_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sgt_courses: {
        Row: {
          city: string | null
          country: string | null
          course_designer: string | null
          course_id: number
          course_key: string | null
          course_location: string | null
          created_at: string
          description: string | null
          difficulty: number | null
          elevation_in_feet: number | null
          id: string
          name: string
          par: number | null
          state: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          course_designer?: string | null
          course_id: number
          course_key?: string | null
          course_location?: string | null
          created_at?: string
          description?: string | null
          difficulty?: number | null
          elevation_in_feet?: number | null
          id?: string
          name: string
          par?: number | null
          state?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          country?: string | null
          course_designer?: string | null
          course_id?: number
          course_key?: string | null
          course_location?: string | null
          created_at?: string
          description?: string | null
          difficulty?: number | null
          elevation_in_feet?: number | null
          id?: string
          name?: string
          par?: number | null
          state?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sgt_members: {
        Row: {
          created_at: string
          exempt_from_cleanup: boolean
          id: string
          updated_at: string
          user_active: number
          user_country_code: string | null
          user_email: string | null
          user_game_id: string | null
          user_has_avatar: string | null
          user_id: number
          user_name: string
        }
        Insert: {
          created_at?: string
          exempt_from_cleanup?: boolean
          id?: string
          updated_at?: string
          user_active?: number
          user_country_code?: string | null
          user_email?: string | null
          user_game_id?: string | null
          user_has_avatar?: string | null
          user_id: number
          user_name: string
        }
        Update: {
          created_at?: string
          exempt_from_cleanup?: boolean
          id?: string
          updated_at?: string
          user_active?: number
          user_country_code?: string | null
          user_email?: string | null
          user_game_id?: string | null
          user_has_avatar?: string | null
          user_id?: number
          user_name?: string
        }
        Relationships: []
      }
      sgt_notification_settings: {
        Row: {
          created_at: string
          id: string
          new_member_email_enabled: boolean
          notification_email: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_member_email_enabled?: boolean
          notification_email?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          new_member_email_enabled?: boolean
          notification_email?: string | null
          updated_at?: string
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
        Relationships: [
          {
            foreignKeyName: "fk_sgt_scorecards_tournament"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "sgt_tournaments"
            referencedColumns: ["tournament_id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "fk_sgt_tour_members_tour"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "sgt_tours"
            referencedColumns: ["tour_id"]
          },
        ]
      }
      sgt_tour_settings: {
        Row: {
          auto_register_members: boolean
          auto_register_tournaments: boolean
          created_at: string
          id: string
          tour_id: number
          updated_at: string
          use_combo_handicap: boolean
        }
        Insert: {
          auto_register_members?: boolean
          auto_register_tournaments?: boolean
          created_at?: string
          id?: string
          tour_id: number
          updated_at?: string
          use_combo_handicap?: boolean
        }
        Update: {
          auto_register_members?: boolean
          auto_register_tournaments?: boolean
          created_at?: string
          id?: string
          tour_id?: number
          updated_at?: string
          use_combo_handicap?: boolean
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
        Relationships: [
          {
            foreignKeyName: "fk_sgt_tour_standings_tour"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "sgt_tours"
            referencedColumns: ["tour_id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "fk_sgt_tournaments_tour"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "sgt_tours"
            referencedColumns: ["tour_id"]
          },
        ]
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
      system_settings: {
        Row: {
          created_at: string
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      table_service_hours: {
        Row: {
          close_time: string
          created_at: string
          day_of_week: number
          id: string
          is_open: boolean
          open_time: string
          updated_at: string
        }
        Insert: {
          close_time?: string
          created_at?: string
          day_of_week: number
          id?: string
          is_open?: boolean
          open_time?: string
          updated_at?: string
        }
        Update: {
          close_time?: string
          created_at?: string
          day_of_week?: number
          id?: string
          is_open?: boolean
          open_time?: string
          updated_at?: string
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
      cleanup_stale_pending_bookings: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      membership_tier:
        | "visitor"
        | "weekday"
        | "par"
        | "birdie"
        | "eagle"
        | "albatross"
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
      app_role: ["admin", "moderator", "user"],
      membership_tier: [
        "visitor",
        "weekday",
        "par",
        "birdie",
        "eagle",
        "albatross",
      ],
    },
  },
} as const
