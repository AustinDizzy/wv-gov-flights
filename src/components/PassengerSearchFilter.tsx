import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

interface PassengerSearchFilterProps {
  action: string;
  initialSearch: string;
  selectedDepartment?: string;
  selectedDivision?: string;
  sort?: string;
}

export default function PassengerSearchFilter({
  action,
  initialSearch,
  selectedDepartment,
  selectedDivision,
  sort,
}: PassengerSearchFilterProps) {
  const [search, setSearch] = useState(initialSearch);
  const searchTimer = useRef<number>();

  useEffect(
    () => () => {
      window.clearTimeout(searchTimer.current);
    },
    [],
  );

  const navigate = (value: string) => {
    const destination = new URL(action, window.location.href);
    const params = new URLSearchParams();
    const normalizedSearch = value.trim();
    if (normalizedSearch) params.set("search", normalizedSearch);
    if (selectedDepartment) params.set("department", selectedDepartment);
    if (selectedDivision) params.set("division", selectedDivision);
    if (sort) params.set("sort", sort);
    destination.search = params.toString();
    if (destination.href !== window.location.href) {
      window.location.replace(destination.toString());
    }
  };

  return (
    <Field>
      <FieldLabel htmlFor="passenger-search">Search passengers</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          id="passenger-search"
          type="search"
          value={search}
          placeholder="Passenger name…"
          onChange={(event) => {
            const value = event.target.value;
            setSearch(value);
            window.clearTimeout(searchTimer.current);
            searchTimer.current = window.setTimeout(() => navigate(value), 600);
          }}
        />
      </InputGroup>
    </Field>
  );
}
