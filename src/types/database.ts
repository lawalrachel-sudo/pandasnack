export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'picked_up' | 'cancelled'
export type WalletTransactionType = 'credit_stripe' | 'credit_manual' | 'debit_order' | 'debit_snack' | 'refund'
export type DayType = 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi'

export interface Database {
  public: {
    Tables: {
      families: {
        Row: {
          id: string
          name: string
          email: string
          phone: string | null
          auth_user_id: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['families']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['families']['Insert']>
      }
      beneficiaries: {
        Row: {
          id: string
          family_id: string
          first_name: string
          last_name: string | null
          is_active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['beneficiaries']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['beneficiaries']['Insert']>
      }
      catalog_categories: {
        Row: {
          id: string
          name: string
          emoji: string | null
          sort_order: number
        }
        Insert: Omit<Database['public']['Tables']['catalog_categories']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['catalog_categories']['Insert']>
      }
      catalog_items: {
        Row: {
          id: string
          category_id: string
          name: string
          description: string | null
          price_cents: number
          image_url: string | null
          is_active: boolean
          is_menu_only: boolean
          is_snack: boolean
          allergens: Json | null
          sort_order: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['catalog_items']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['catalog_items']['Insert']>
      }
      wallets: {
        Row: {
          id: string
          family_id: string
          balance_cents: number
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['wallets']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['wallets']['Insert']>
      }
      wallet_transactions: {
        Row: {
          id: string
          wallet_id: string
          type: WalletTransactionType
          amount_cents: number
          description: string | null
          stripe_payment_id: string | null
          order_id: string | null
          created_at: string
          created_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['wallet_transactions']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['wallet_transactions']['Insert']>
      }
      orders: {
        Row: {
          id: string
          family_id: string
          order_number: string
          service_slot_id: string
          status: OrderStatus
          total_cents: number
          is_takeaway: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['orders']['Insert']>
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          catalog_item_id: string
          beneficiary_id: string | null
          quantity: number
          unit_price_cents: number
          customizations: Json | null
          is_takeaway: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['order_items']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>
      }
      service_slots: {
        Row: {
          id: string
          period_id: string
          slot_date: string
          day_type: DayType
          is_open: boolean
          order_deadline: string | null
          max_orders: number | null
        }
        Insert: Omit<Database['public']['Tables']['service_slots']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['service_slots']['Insert']>
      }
    }
  }
}
