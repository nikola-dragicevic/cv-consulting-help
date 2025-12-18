"use client"
import * as React from "react"
import { DayPicker } from "react-day-picker"
import "react-day-picker/dist/style.css"
import { format } from "date-fns"
import { sv } from "date-fns/locale" // Svenska
import { createClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"

// Enkla tider för demo (du kan justera dessa)
const TIME_SLOTS = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00"]

export default function BookingCalendar({ onSelectSlot }: { onSelectSlot: (date: Date, time: string) => void }) {
  const [date, setDate] = React.useState<Date | undefined>(new Date())
  const [selectedTime, setSelectedTime] = React.useState<string | null>(null)
  const [busySlots, setBusySlots] = React.useState<string[]>([])

  // Hämta upptagna tider när man byter datum
  React.useEffect(() => {
    if (!date) return;
    
    const fetchAvailability = async () => {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const dateStr = format(date, 'yyyy-MM-dd')

      // 1. Hämta bokningar
      const { data: bookings } = await supabase
        .from('bookings')
        .select('start_time')
        .eq('booking_date', dateStr)

      // 2. Hämta admin-blockeringar
      const { data: blocks } = await supabase
        .from('availability_blocks')
        .select('start_time')
        .eq('block_date', dateStr)

      // Slå ihop upptagna tider (enkelt format HH:00:00 -> HH:00)
      const taken = [
        ...(bookings || []).map(b => b.start_time.slice(0, 5)),
        ...(blocks || []).map(b => b.start_time ? b.start_time.slice(0, 5) : "HELA_DAGEN")
      ]
      setBusySlots(taken)
    }

    fetchAvailability()
    setSelectedTime(null) // Nollställ tid vid datumbyte
  }, [date])

  const handleConfirm = () => {
    if (date && selectedTime) {
      onSelectSlot(date, selectedTime)
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-8 p-4 border rounded-lg bg-white shadow-sm">
      <div>
        <h3 className="font-semibold mb-2">1. Välj Datum</h3>
        <DayPicker
          mode="single"
          selected={date}
          onSelect={setDate}
          locale={sv}
          disabled={{ before: new Date() }} // Kan inte boka bakåt i tiden
          className="border rounded-md p-2"
        />
      </div>

      <div className="flex-1">
        <h3 className="font-semibold mb-2">2. Välj Tid</h3>
        {!date ? (
          <p className="text-gray-500">Välj ett datum först.</p>
        ) : busySlots.includes("HELA_DAGEN") ? (
           <p className="text-red-500">Inga tider tillgängliga detta datum.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {TIME_SLOTS.map((time) => {
              const isTaken = busySlots.includes(time)
              return (
                <button
                  key={time}
                  disabled={isTaken}
                  onClick={() => setSelectedTime(time)}
                  className={`p-2 rounded border text-sm transition-colors ${
                    selectedTime === time
                      ? "bg-blue-600 text-white border-blue-600"
                      : isTaken
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "hover:border-blue-500 hover:bg-blue-50"
                  }`}
                >
                  {time} {isTaken && "(Upptagen)"}
                </button>
              )
            })}
          </div>
        )}

        <div className="mt-8 pt-4 border-t">
            <Button 
                disabled={!date || !selectedTime} 
                onClick={handleConfirm}
                className="w-full"
            >
                Gå vidare till betalning
            </Button>
        </div>
      </div>
    </div>
  )
}