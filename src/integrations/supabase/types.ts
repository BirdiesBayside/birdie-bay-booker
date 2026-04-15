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
          notes: string | null
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
          notes?: string | null
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
          notes?: string | null
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
      comp_partner_board: {
        Row: {
          contact_info: string
          created_at: string
          handicap: number | null
          id: string
          is_active: boolean
          player_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_info: string
          created_at?: string
          handicap?: number | null
          id?: string
          is_active?: boolean
          player_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_info?: string
          created_at?: string
          handicap?: number | null
          id?: string
          is_active?: boolean
          player_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comp_survey_responses: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          preferred_day: string | null
          preferred_entry_fee: string | null
          preferred_time: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          preferred_day?: string | null
          preferred_entry_fee?: string | null
          preferred_time?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          preferred_day?: string | null
          preferred_entry_fee?: string | null
          preferred_time?: string | null
        }
        Relationships: []
      }
      deposit_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          related_booking_id: string | null
          related_gift_card_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          related_booking_id?: string | null
          related_gift_card_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          related_booking_id?: string | null
          related_gift_card_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_transactions_related_booking_id_fkey"
            columns: ["related_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_transactions_related_gift_card_id_fkey"
            columns: ["related_gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
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
      feedback_emails_sent: {
        Row: {
          email: string
          feedback_received: boolean
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          email: string
          feedback_received?: boolean
          id?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          email?: string
          feedback_received?: boolean
          id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feedback_responses: {
        Row: {
          comment: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          score: string
          token: string
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          score: string
          token: string
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          score?: string
          token?: string
          user_id?: string | null
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
      google_review_rewards: {
        Row: {
          approved_at: string
          approved_by: string | null
          created_at: string
          credit_amount: number
          credit_issued: boolean
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          credit_amount?: number
          credit_issued?: boolean
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          created_at?: string
          credit_amount?: number
          credit_issued?: boolean
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      local_comp_saved_teams: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          player1_handicap: number
          player1_name: string
          player2_handicap: number
          player2_name: string
          team_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          player1_handicap?: number
          player1_name: string
          player2_handicap?: number
          player2_name: string
          team_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          player1_handicap?: number
          player1_name?: string
          player2_handicap?: number
          player2_name?: string
          team_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      local_comp_settings: {
        Row: {
          created_at: string
          default_entry_fee: number
          default_format: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_entry_fee?: number
          default_format?: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_entry_fee?: number
          default_format?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      local_comp_teams: {
        Row: {
          combined_handicap: number
          competition_id: string
          created_at: string
          gross_score: number | null
          id: string
          net_score: number | null
          paid: boolean
          player1_handicap: number
          player1_name: string
          player1_paid: boolean
          player2_handicap: number
          player2_name: string
          player2_paid: boolean
          position: number | null
          team_name: string
        }
        Insert: {
          combined_handicap?: number
          competition_id: string
          created_at?: string
          gross_score?: number | null
          id?: string
          net_score?: number | null
          paid?: boolean
          player1_handicap?: number
          player1_name: string
          player1_paid?: boolean
          player2_handicap?: number
          player2_name: string
          player2_paid?: boolean
          position?: number | null
          team_name: string
        }
        Update: {
          combined_handicap?: number
          competition_id?: string
          created_at?: string
          gross_score?: number | null
          id?: string
          net_score?: number | null
          paid?: boolean
          player1_handicap?: number
          player1_name?: string
          player1_paid?: boolean
          player2_handicap?: number
          player2_name?: string
          player2_paid?: boolean
          position?: number | null
          team_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "local_comp_teams_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "local_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      local_competitions: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          entry_fee: number
          format: string
          id: string
          name: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          entry_fee?: number
          format?: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          entry_fee?: number
          format?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      loyalty_credits_issued: {
        Row: {
          created_at: string
          credit_amount: number
          id: string
          milestone_number: number
          total_bookings_at_issue: number
          user_id: string
        }
        Insert: {
          created_at?: string
          credit_amount: number
          id?: string
          milestone_number: number
          total_bookings_at_issue: number
          user_id: string
        }
        Update: {
          created_at?: string
          credit_amount?: number
          id?: string
          milestone_number?: number
          total_bookings_at_issue?: number
          user_id?: string
        }
        Relationships: []
      }
      loyalty_promo_settings: {
        Row: {
          created_at: string
          credit_amount: number
          enabled: boolean
          id: string
          updated_at: string
          visit_threshold: number
        }
        Insert: {
          created_at?: string
          credit_amount?: number
          enabled?: boolean
          id?: string
          updated_at?: string
          visit_threshold?: number
        }
        Update: {
          created_at?: string
          credit_amount?: number
          enabled?: boolean
          id?: string
          updated_at?: string
          visit_threshold?: number
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
      membership_changes: {
        Row: {
          changed_at: string
          id: string
          new_tier: string
          previous_tier: string
          user_id: string
        }
        Insert: {
          changed_at?: string
          id?: string
          new_tier: string
          previous_tier: string
          user_id: string
        }
        Update: {
          changed_at?: string
          id?: string
          new_tier?: string
          previous_tier?: string
          user_id?: string
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
          first_session_promo_sent: string | null
          id: string
          last_name: string
          marketing_opt_out: boolean | null
          membership_on_hold: boolean
          membership_tier: Database["public"]["Enums"]["membership_tier"]
          payment_failed_at: string | null
          phone: string | null
          sgt_user_id: number | null
          total_bookings: number
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
          first_session_promo_sent?: string | null
          id?: string
          last_name: string
          marketing_opt_out?: boolean | null
          membership_on_hold?: boolean
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          payment_failed_at?: string | null
          phone?: string | null
          sgt_user_id?: number | null
          total_bookings?: number
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
          first_session_promo_sent?: string | null
          id?: string
          last_name?: string
          marketing_opt_out?: boolean | null
          membership_on_hold?: boolean
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          payment_failed_at?: string | null
          phone?: string | null
          sgt_user_id?: number | null
          total_bookings?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
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
      sgt_monthly_awards: {
        Row: {
          awarded_at: string
          awarded_by: string | null
          created_at: string | null
          id: string
          month: string
          notes: string | null
          prize_description: string | null
          tour_id: number
          winner_player_id: number | null
          winner_player_name: string
          winner_profile_user_id: string | null
        }
        Insert: {
          awarded_at?: string
          awarded_by?: string | null
          created_at?: string | null
          id?: string
          month: string
          notes?: string | null
          prize_description?: string | null
          tour_id: number
          winner_player_id?: number | null
          winner_player_name: string
          winner_profile_user_id?: string | null
        }
        Update: {
          awarded_at?: string
          awarded_by?: string | null
          created_at?: string | null
          id?: string
          month?: string
          notes?: string | null
          prize_description?: string | null
          tour_id?: number
          winner_player_id?: number | null
          winner_player_name?: string
          winner_profile_user_id?: string | null
        }
        Relationships: []
      }
      sgt_monthly_standings: {
        Row: {
          best_gross: number | null
          best_net: number | null
          created_at: string
          gross_position: number | null
          id: string
          month: string
          monthly_gross_points: number
          monthly_net_points: number
          net_position: number | null
          player_id: number
          player_name: string
          total_gross_score: number | null
          total_net_score: number | null
          tour_id: number
          tournaments_played: number
          updated_at: string
        }
        Insert: {
          best_gross?: number | null
          best_net?: number | null
          created_at?: string
          gross_position?: number | null
          id?: string
          month: string
          monthly_gross_points?: number
          monthly_net_points?: number
          net_position?: number | null
          player_id: number
          player_name: string
          total_gross_score?: number | null
          total_net_score?: number | null
          tour_id: number
          tournaments_played?: number
          updated_at?: string
        }
        Update: {
          best_gross?: number | null
          best_net?: number | null
          created_at?: string
          gross_position?: number | null
          id?: string
          month?: string
          monthly_gross_points?: number
          monthly_net_points?: number
          net_position?: number | null
          player_id?: number
          player_name?: string
          total_gross_score?: number | null
          total_net_score?: number | null
          tour_id?: number
          tournaments_played?: number
          updated_at?: string
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
      sgt_weekly_prizes: {
        Row: {
          awarded_at: string
          created_at: string | null
          email_sent: boolean | null
          id: string
          player_id: number
          player_name: string
          prize_amount: number
          profile_user_id: string | null
          status: string
          tournament_id: number
        }
        Insert: {
          awarded_at?: string
          created_at?: string | null
          email_sent?: boolean | null
          id?: string
          player_id: number
          player_name: string
          prize_amount?: number
          profile_user_id?: string | null
          status?: string
          tournament_id: number
        }
        Update: {
          awarded_at?: string
          created_at?: string | null
          email_sent?: boolean | null
          id?: string
          player_id?: number
          player_name?: string
          prize_amount?: number
          profile_user_id?: string | null
          status?: string
          tournament_id?: number
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
