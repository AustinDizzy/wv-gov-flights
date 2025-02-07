'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Table } from "@tanstack/table-core"

interface DataTablePaginationProps<TData> {
  table: Table<TData>
  totalItems: number
}

export function DataTablePagination<TData>({
  table,
  totalItems,
}: DataTablePaginationProps<TData>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const page = table.getState().pagination.pageIndex + 1
  const totalPages = Math.ceil(totalItems / table.getState().pagination.pageSize)

  const createQueryString = (params: Record<string, string>) => {
    const newSearchParams = new URLSearchParams(searchParams.toString())
    
    for (const [key, value] of Object.entries(params)) {
      if (value === null) {
        newSearchParams.delete(key)
      } else {
        newSearchParams.set(key, value)
      }
    }
    
    return newSearchParams.toString()
  }

  const goToPage = (page: number) => {
    router.push(
      `${pathname}?${createQueryString({
        page: page.toString(),
        size: table.getState().pagination.pageSize.toString(),
      })}`
    )
    table.setPageIndex(page - 1)
  }

  // Generate page numbers to show
  const generatePaginationItems = () => {
    const items: number[] = []
    const maxVisible = 7 // Max number of page buttons to show
    const ellipsis = -1

    let leftSide = Math.floor(maxVisible / 2)
    let rightSide = maxVisible - leftSide

    // If close to beginning, show more right side
    if (page <= leftSide) {
      rightSide = maxVisible - page + 1
      leftSide = page - 1
    }
    // If close to end, show more left side
    else if (page >= totalPages - rightSide + 1) {
      leftSide = maxVisible - (totalPages - page) - 1
      rightSide = totalPages - page
    }

    // Generate array of page numbers and ellipsis markers
    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 || // First page
        i === totalPages || // Last page
        (i >= page - leftSide && i <= page + rightSide) // Pages around current
      ) {
        items.push(i)
      } else if (items[items.length - 1] !== ellipsis) {
        items.push(ellipsis)
      }
    }

    return items
  }

  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="flex-1 text-sm text-muted-foreground">
        {table.getFilteredRowModel().rows.length} of{" "}
        {totalItems} row(s)
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
              goToPage(1)
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => goToPage(page - 1)}
                isActive={table.getCanPreviousPage()}
                href={"#"}
              />
            </PaginationItem>

            {generatePaginationItems().map((pageNum, idx) => {
              if (pageNum === -1) {
                return (
                  <PaginationItem key={`ellipsis-${idx}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                )
              }

              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    onClick={() => goToPage(pageNum)}
                    isActive={pageNum === page}
                    href={"#"}
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              )
            })}

            <PaginationItem>
              <PaginationNext
                onClick={() => goToPage(page + 1)}
                isActive={table.getCanNextPage()}
                href={"#"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}